/* global process */
import { lookup as dnsLookupCallback } from 'node:dns'
import { lookup as dnsLookup } from 'node:dns/promises'
import net from 'node:net'

const DEFAULT_MAX_URL_LENGTH = 2048
const DEFAULT_PUBLIC_URL_ERROR = '공개된 http/https URL만 사용할 수 있습니다.'
const DEFAULT_TOO_LONG_ERROR = 'URL이 너무 깁니다.'
const DNS_LOOKUP_ERROR = 'URL 호스트를 확인할 수 없습니다.'

function normalizeHostname(hostname) {
  return String(hostname || '')
    .trim()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase()
}

function ipv4ToInt(ip) {
  const parts = ip.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return null
  }
  return parts.reduce((acc, part) => ((acc << 8) + part) >>> 0, 0)
}

function isInIpv4Cidr(ip, base, bits) {
  const value = ipv4ToInt(ip)
  const baseValue = ipv4ToInt(base)
  if (value == null || baseValue == null) return false
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return (value & mask) === (baseValue & mask)
}

// 압축(::)·IPv4 꼬리 표기를 모두 8개의 16비트 그룹으로 펼칩니다. 해석 못 하면 null.
function expandIpv6(ip) {
  let canonical
  try {
    // URL 파서가 IPv4 꼬리(::ffff:1.2.3.4)를 hex 그룹으로 바꿔 줍니다.
    canonical = new URL(`http://[${ip}]`).hostname.slice(1, -1)
  } catch {
    return null
  }
  const [head, tail] = canonical.split('::')
  const headGroups = head ? head.split(':') : []
  const tailGroups = tail ? tail.split(':') : []
  const zeros = tail === undefined ? [] : Array(8 - headGroups.length - tailGroups.length).fill('0')
  return [...headGroups, ...zeros, ...tailGroups].map((group) => parseInt(group, 16))
}

export function isBlockedIpAddress(ip) {
  const normalized = normalizeHostname(ip)
  const ipVersion = net.isIP(normalized)
  if (ipVersion === 4) {
    return [
      ['0.0.0.0', 8],
      ['10.0.0.0', 8],
      ['100.64.0.0', 10],
      ['127.0.0.0', 8],
      ['169.254.0.0', 16],
      ['172.16.0.0', 12],
      ['192.0.0.0', 24],
      ['192.0.2.0', 24],
      ['192.168.0.0', 16],
      ['198.18.0.0', 15],
      ['198.51.100.0', 24],
      ['203.0.113.0', 24],
      ['224.0.0.0', 4],
      ['240.0.0.0', 4],
    ].some(([base, bits]) => isInIpv4Cidr(normalized, base, bits))
  }

  if (ipVersion === 6) {
    const groups = expandIpv6(normalized)
    if (!groups) return true
    const toIpv4 = (high, low) =>
      [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.')

    // IPv4-mapped(::ffff:a.b.c.d)는 감싼 IPv4로 판단합니다.
    if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
      return isBlockedIpAddress(toIpv4(groups[6], groups[7]))
    }
    // 6to4(2002:aabb:ccdd::/48)는 2~3번째 그룹에 IPv4를 담습니다.
    if (groups[0] === 0x2002) {
      return isBlockedIpAddress(toIpv4(groups[1], groups[2]))
    }
    // Teredo(2001:0::/32)는 난독화된 IPv4를 담고 있어 통째로 막습니다.
    if (groups[0] === 0x2001 && groups[1] === 0) return true

    return (
      // ::, ::1, IPv4-compatible(::7f00:1) 등 '::'로 시작하는 예약 대역
      normalized.startsWith('::') ||
      // NAT64(64:ff9b::/96)는 내부 IPv4를 감쌀 수 있습니다.
      normalized.startsWith('64:ff9b:') ||
      normalized.startsWith('fec') ||
      normalized.startsWith('fed') ||
      normalized.startsWith('fee') ||
      normalized.startsWith('fef') ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb') ||
      normalized.startsWith('ff')
    )
  }

  return false
}

function isBlockedHostname(hostname) {
  const host = normalizeHostname(hostname)
  return (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === 'metadata.google.internal' ||
    isBlockedIpAddress(host)
  )
}

function shouldResolveDns() {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.ENFORCE_PUBLIC_URL_DNS_GUARD === '1'
  )
}

async function hostnameResolvesToBlockedAddress(hostname) {
  const host = normalizeHostname(hostname)
  if (net.isIP(host)) return isBlockedIpAddress(host)
  const records = await dnsLookup(host, { all: true, verbatim: true })
  return records.some((record) => isBlockedIpAddress(record.address))
}

// 소켓 연결 직전에 쓰는 dns.lookup 대체. 검증 때와 연결 때 DNS 응답이 달라지는
// DNS rebinding을 막기 위해, 실제로 연결할 주소를 여기서 한 번 더 확인합니다.
export function lookupPublicAddress(hostname, options, callback) {
  dnsLookupCallback(hostname, options, (err, address, family) => {
    if (err) return callback(err)
    const records = Array.isArray(address) ? address : [{ address }]
    if (records.some((record) => isBlockedIpAddress(record.address))) {
      return callback(Object.assign(new Error(DEFAULT_PUBLIC_URL_ERROR), { code: 'EBLOCKEDADDR' }))
    }
    callback(null, address, family)
  })
}

export async function validatePublicHttpUrl(
  rawUrl,
  {
    errorMessage = DEFAULT_PUBLIC_URL_ERROR,
    maxLength = DEFAULT_MAX_URL_LENGTH,
    tooLongError = DEFAULT_TOO_LONG_ERROR,
    resolveDns = shouldResolveDns(),
  } = {},
) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { ok: false, status: 400, error: errorMessage }
  }

  const value = rawUrl.trim()
  if (value.length > maxLength) {
    return { ok: false, status: 400, error: tooLongError }
  }

  let url
  try {
    url = new URL(value)
  } catch {
    return { ok: false, status: 400, error: errorMessage }
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return { ok: false, status: 400, error: errorMessage }
  }
  if (url.username || url.password) {
    return {
      ok: false,
      status: 400,
      error: '인증 정보가 포함된 URL은 사용할 수 없습니다.',
    }
  }
  if (isBlockedHostname(url.hostname)) {
    return { ok: false, status: 400, error: errorMessage }
  }

  if (resolveDns) {
    try {
      if (await hostnameResolvesToBlockedAddress(url.hostname)) {
        return { ok: false, status: 400, error: errorMessage }
      }
    } catch {
      return { ok: false, status: 400, error: DNS_LOOKUP_ERROR }
    }
  }

  return { ok: true, url: url.toString() }
}

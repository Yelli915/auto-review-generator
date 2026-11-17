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

// 사설·예약 대역. BlockList는 IPv4-mapped(::ffff:a.b.c.d)를 감싼 IPv4 규칙으로 검사합니다.
const BLOCKED_ADDRESSES = new net.BlockList()
for (const [base, bits] of [
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
]) {
  BLOCKED_ADDRESSES.addSubnet(base, bits, 'ipv4')
}
for (const [base, bits] of [
  ['::', 96], // ::, IPv4-compatible(::7f00:1)
  ['::1', 128],
  // 아래 셋은 내부 IPv4를 감쌀 수 있어 통째로 막습니다.
  ['64:ff9b::', 96], // NAT64
  ['2001::', 32], // Teredo
  ['2002::', 16], // 6to4 (RFC 7526로 폐기됨)
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local
  ['ff00::', 8], // multicast
]) {
  BLOCKED_ADDRESSES.addSubnet(base, bits, 'ipv6')
}

export function isBlockedIpAddress(ip) {
  const normalized = normalizeHostname(ip)
  const ipVersion = net.isIP(normalized)
  if (!ipVersion) return false
  return BLOCKED_ADDRESSES.check(normalized, ipVersion === 6 ? 'ipv6' : 'ipv4')
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

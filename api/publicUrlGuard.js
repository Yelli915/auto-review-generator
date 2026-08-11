/* global process */
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
    const dottedMapped = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)
    if (dottedMapped) return isBlockedIpAddress(dottedMapped[1])

    // The WHATWG URL parser normalizes IPv4-mapped IPv6 hosts to hex groups
    // (e.g. ::ffff:127.0.0.1 -> ::ffff:7f00:1), so url.hostname never matches
    // the dotted-decimal form above and must be decoded separately.
    const hexMapped = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
    if (hexMapped) {
      const high = parseInt(hexMapped[1], 16)
      const low = parseInt(hexMapped[2], 16)
      const dotted = [
        (high >> 8) & 0xff,
        high & 0xff,
        (low >> 8) & 0xff,
        low & 0xff,
      ].join('.')
      return isBlockedIpAddress(dotted)
    }

    return (
      normalized === '::' ||
      normalized === '::1' ||
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

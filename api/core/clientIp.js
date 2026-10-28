/* global process */
import net from 'node:net'

function normalizeIp(raw) {
  if (typeof raw !== 'string') return ''
  return raw.trim().replace(/^::ffff:/, '')
}

function isValidIp(ip) {
  return net.isIP(ip) !== 0
}

function shouldTrustProxyHeaders() {
  return process.env.TRUST_PROXY_HEADERS === '1'
}

export function getClientIp(req) {
  if (shouldTrustProxyHeaders()) {
    const forwarded = req.headers?.['x-forwarded-for']
    if (typeof forwarded === 'string' && forwarded.trim()) {
      const candidate = normalizeIp(forwarded.split(',')[0])
      if (isValidIp(candidate)) return candidate
    }
    const realIp = req.headers?.['x-real-ip']
    if (typeof realIp === 'string' && realIp.trim()) {
      const candidate = normalizeIp(realIp)
      if (isValidIp(candidate)) return candidate
    }
  }
  const socketIp = normalizeIp(req.socket?.remoteAddress || '')
  return isValidIp(socketIp) ? socketIp : ''
}

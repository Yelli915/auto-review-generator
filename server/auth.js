/* global process */
import net from 'node:net'
import { getTrimmedEnv } from './config.js'

function normalizeOrigin(value) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) return ''
  try {
    return new URL(trimmed).origin
  } catch {
    return trimmed
  }
}

function parseAllowOrigins() {
  const list = getTrimmedEnv('ALLOWED_ORIGINS')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean)
  return list.length ? new Set(list) : null
}

// 운영 환경에서만 ALLOWED_ORIGINS에 있는 출처의 요청을 받습니다. 남용은 IP별 rate limit·일일 한도가 막습니다.
export function authorizeRequest(req) {
  if (process.env.NODE_ENV !== 'production') return { ok: true }
  const allowSet = parseAllowOrigins()
  if (!allowSet) {
    return { ok: false, status: 500, error: '서버 설정 오류: ALLOWED_ORIGINS가 필요합니다.' }
  }
  if (!allowSet.has(normalizeOrigin(req.headers?.origin))) {
    return { ok: false, status: 403, error: '허용되지 않은 출처의 요청입니다.' }
  }
  return { ok: true }
}

// -- client IP --

function normalizeIp(raw) {
  if (typeof raw !== 'string') return ''
  return raw.trim().replace(/^::ffff:/, '')
}

function isValidIp(ip) {
  return net.isIP(ip) !== 0
}

function shouldTrustProxyHeaders() {
  // Vercel은 x-forwarded-for를 실제 클라이언트 IP로 덮어써서 위조할 수 없습니다.
  return process.env.TRUST_PROXY_HEADERS === '1' || process.env.VERCEL === '1'
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

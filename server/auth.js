/* global process, Buffer */
import { timingSafeEqual } from 'node:crypto'
import net from 'node:net'
import { OAuth2Client } from 'google-auth-library'
import { getTrimmedEnv } from './config.js'

const GOOGLE_OAUTH_CLIENT = new OAuth2Client()

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

function isTrustedOrigin(req) {
  const origin = normalizeOrigin(req.headers?.origin)
  if (!origin) return false
  const allowSet = parseAllowOrigins()
  if (allowSet) return allowSet.has(origin)
  if (process.env.NODE_ENV === 'production') return false
  const host = req.headers?.host
  if (typeof host !== 'string' || !host.trim()) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

function isSameToken(value, expected) {
  if (typeof value !== 'string') return false
  const a = Buffer.from(value.trim())
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function getBearerToken(req) {
  const auth = req.headers?.authorization
  if (typeof auth !== 'string') return ''
  const match = auth.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : ''
}

async function verifyGoogleToken(idToken, audience) {
  try {
    const ticket = await GOOGLE_OAUTH_CLIENT.verifyIdToken({
      idToken,
      audience,
    })
    const payload = ticket.getPayload()
    if (!payload?.sub) {
      return { ok: false, status: 401, error: '로그인 정보가 올바르지 않습니다. 다시 로그인해 주세요.' }
    }
    return { ok: true, userId: payload.sub }
  } catch {
    return {
      ok: false,
      status: 401,
      error: '로그인이 만료되었거나 올바르지 않습니다. 다시 로그인해 주세요.',
    }
  }
}

function rejectUntrustedProductionOrigin(req) {
  if (process.env.NODE_ENV !== 'production' || isTrustedOrigin(req)) return null
  return { ok: false, status: 403, error: '허용되지 않은 출처의 요청입니다.' }
}

function rejectMissingProductionConfig(googleClientId, appAuthToken) {
  if (process.env.NODE_ENV !== 'production') return null
  if (!googleClientId && !appAuthToken) {
    return {
      ok: false,
      status: 500,
      error: '서버 설정 오류: GOOGLE_CLIENT_ID가 필요합니다.',
    }
  }
  if (!parseAllowOrigins()) {
    return {
      ok: false,
      status: 500,
      error: '서버 설정 오류: ALLOWED_ORIGINS가 필요합니다.',
    }
  }
  return null
}

export async function authorizeRequest(req) {
  const googleClientId = getTrimmedEnv('GOOGLE_CLIENT_ID')
  const appAuthToken = getTrimmedEnv('API_AUTH_TOKEN')
  const missingProductionConfig = rejectMissingProductionConfig(
    googleClientId,
    appAuthToken,
  )
  if (missingProductionConfig) return missingProductionConfig

  // 누구인지 먼저 확인하고, 출처 검사는 모든 경로에서 한 번만 합니다.
  const identity = await identifyRequest(req, googleClientId, appAuthToken)
  if (!identity.ok) return identity
  return rejectUntrustedProductionOrigin(req) ?? identity
}

// Google 로그인 토큰이 있으면 우선 쓰고, 없으면 앱 토큰을 확인합니다. 둘 다 설정되지 않았으면(개발 환경) 익명으로 통과합니다.
async function identifyRequest(req, googleClientId, appAuthToken) {
  const bearer = getBearerToken(req)
  if (googleClientId && bearer) return verifyGoogleToken(bearer, googleClientId)
  if (appAuthToken) {
    return isSameToken(req.headers?.['x-api-auth-token'], appAuthToken)
      ? { ok: true, userId: null }
      : { ok: false, status: 401, error: '인증되지 않은 요청입니다.' }
  }
  if (googleClientId) {
    return { ok: false, status: 401, error: 'Google 로그인이 필요합니다.' }
  }
  return { ok: true, userId: null }
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

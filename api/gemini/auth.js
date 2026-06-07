/* global process */
import { OAuth2Client } from 'google-auth-library'

const GOOGLE_OAUTH_CLIENT = new OAuth2Client()

function getTrimmedEnv(name) {
  return typeof process.env[name] === 'string' ? process.env[name].trim() : ''
}

function parseAllowOrigins() {
  const list = getTrimmedEnv('ALLOWED_ORIGINS')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return list.length ? new Set(list) : null
}

function hasConfiguredAllowOrigins() {
  return parseAllowOrigins() !== null
}

function isTrustedOrigin(req) {
  const origin = req.headers?.origin
  if (typeof origin !== 'string' || !origin.trim()) return false
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
      return { ok: false, status: 401, error: 'Invalid login token.' }
    }
    return { ok: true, userId: payload.sub }
  } catch {
    return {
      ok: false,
      status: 401,
      error: 'Login expired or token is invalid.',
    }
  }
}

function rejectUntrustedProductionOrigin(req) {
  if (process.env.NODE_ENV !== 'production' || isTrustedOrigin(req)) return null
  return { ok: false, status: 403, error: 'Origin is not allowed.' }
}

function rejectMissingProductionConfig(googleClientId, appAuthToken) {
  if (process.env.NODE_ENV !== 'production') return null
  if (!googleClientId && !appAuthToken) {
    return {
      ok: false,
      status: 500,
      error: 'Server configuration error: GOOGLE_CLIENT_ID is required.',
    }
  }
  if (!hasConfiguredAllowOrigins()) {
    return {
      ok: false,
      status: 500,
      error: 'Server configuration error: ALLOWED_ORIGINS is required.',
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

  const bearer = getBearerToken(req)
  if (googleClientId && bearer) {
    const verified = await verifyGoogleToken(bearer, googleClientId)
    if (!verified.ok) return verified
    const untrustedOrigin = rejectUntrustedProductionOrigin(req)
    if (untrustedOrigin) return untrustedOrigin
    return { ok: true, userId: verified.userId }
  }

  if (appAuthToken) {
    const headerToken = req.headers?.['x-api-auth-token']
    if (typeof headerToken !== 'string' || headerToken.trim() !== appAuthToken) {
      return { ok: false, status: 401, error: 'Request is not authenticated.' }
    }
  }
  if (googleClientId && !appAuthToken) {
    return { ok: false, status: 401, error: 'Google login is required.' }
  }
  const untrustedOrigin = rejectUntrustedProductionOrigin(req)
  if (untrustedOrigin) return untrustedOrigin
  return { ok: true, userId: null }
}

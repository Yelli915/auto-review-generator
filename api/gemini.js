/* global Buffer, process */
import { OAuth2Client } from 'google-auth-library'
import { createJsonHeaders, readJsonSafely } from '../shared/httpJson.js'
import { MAX_REVIEW_IMAGE_COUNT } from '../shared/reviewCategories.js'
import { normalizeReviewTone } from '../shared/reviewOptions.js'
import { hasHangul, isLikelyKeywordPhrase } from './keywordUtils.js'
import {
  buildKeywordPrompt,
  buildReviewPrompt,
} from './prompts.js'

const MODEL = 'gemini-2.5-flash'
const RETRYABLE_STATUS = new Set([500, 502, 503, 504])
const MAX_RETRIES = 2
const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024
const MAX_IMAGE_BYTES = 1536 * 1024
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_MAX_REQUESTS = 20
const RATE_LIMIT_STORE = new Map()
const DAILY_USAGE_MAX_REQUESTS = 20
const DAILY_USAGE_ACTIONS = new Set(['keywords', 'review'])
const DAILY_USAGE_STORE = new Map()
const USAGE_STORE_KEY_PREFIX = 'auto-review-generator'
const GOOGLE_OAUTH_CLIENT = new OAuth2Client()
const DEBUG_LOGS =
  process.env.NODE_ENV !== 'production' || process.env.GEMINI_DEBUG_LOGS === '1'

const KEYWORDS_MIN_COUNT = 3
const KEYWORDS_MAX_COUNT = 8
const KEYWORD_LEN_MIN = 2
const KEYWORD_LEN_MAX = 30
const KEYWORDS_MAX_OUTPUT_TOKENS = 1024
const REVIEW_MAX_OUTPUT_TOKENS = {
  short: 2048,
  medium: 3072,
  long: 4096,
}
const KEYWORD_RETRY_LIMIT = 3

function normalizeKeywordSet(keywords) {
  const normalized = Array.isArray(keywords)
    ? keywords
        .map((keyword) =>
          typeof keyword === 'string' ? keyword.replace(/\s+/g, ' ').trim() : '',
        )
        .filter(Boolean)
    : []
  return sanitizeKeywordArray(normalized) || []
}

export function keywordSignature(keywords) {
  return normalizeKeywordSet(keywords)
    .sort((a, b) => a.localeCompare(b, 'ko'))
    .join('|')
}

export function isSameKeywordSet(a, b) {
  const aSignature = keywordSignature(a)
  return Boolean(aSignature) && aSignature === keywordSignature(b)
}

export function appendKeywordRetryGuidance(prompt, rejectedSets) {
  const safeRejectedSets = Array.isArray(rejectedSets)
    ? rejectedSets.map((set) => normalizeKeywordSet(set)).filter((set) => set.length > 0)
    : []
  if (!safeRejectedSets.length) return prompt

  const previousRuns = safeRejectedSets
    .map((set, index) => `${index + 1}. ${set.join(', ')}`)
    .join('\n')

  return (
    `${prompt}\n\n` +
    '금지된 이전 키워드 조합:\n' +
    `${previousRuns}\n\n` +
    '위 목록 중 어느 것과도 완전히 같은 조합을 다시 내지 마. ' +
    '최소 1개는 다른 표현으로 바꾸고, 가능하면 다른 관찰 포인트를 하나 더 넣어 JSON만 출력해.'
  )
}

function setCommonSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('X-Frame-Options', 'DENY')
}

function json(res, code, body) {
  res.statusCode = code
  setCommonSecurityHeaders(res)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function normalizeIp(raw) {
  if (typeof raw !== 'string') return ''
  return raw.trim().replace(/^::ffff:/, '')
}

function isValidIp(ip) {
  if (typeof ip !== 'string' || !ip) return false
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) {
    return ip.split('.').every((part) => {
      const n = Number(part)
      return Number.isInteger(n) && n >= 0 && n <= 255
    })
  }
  return /^[a-fA-F0-9:]+$/.test(ip)
}

function shouldTrustProxyHeaders() {
  return process.env.TRUST_PROXY_HEADERS === '1'
}

function getClientIp(req) {
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

function encodeUsageKeyPart(value) {
  return encodeURIComponent(String(value || 'unknown'))
}

function getSharedUsageStoreConfig() {
  const url =
    typeof process.env.UPSTASH_REDIS_REST_URL === 'string'
      ? process.env.UPSTASH_REDIS_REST_URL.trim().replace(/\/+$/, '')
      : ''
  const token =
    typeof process.env.UPSTASH_REDIS_REST_TOKEN === 'string'
      ? process.env.UPSTASH_REDIS_REST_TOKEN.trim()
      : ''
  return url && token ? { url, token } : null
}

async function callSharedUsageStore(config, commands) {
  const response = await fetch(`${config.url}/pipeline`, {
    method: 'POST',
    headers: createJsonHeaders({ Authorization: `Bearer ${config.token}` }),
    body: JSON.stringify(commands),
  })
  const data = await readJsonSafely(response)
  if (!response.ok || !Array.isArray(data)) {
    throw new Error('공유 사용량 저장소에 접근할 수 없습니다.')
  }
  return data
}

async function incrementSharedUsageLimit({
  config,
  key,
  limit,
  ttlSec,
  retryAfterSec = ttlSec,
}) {
  const results = await callSharedUsageStore(config, [
    ['INCR', key],
    ['EXPIRE', key, ttlSec, 'NX'],
  ])
  const count = Number(results[0]?.result)
  if (!Number.isFinite(count)) {
    throw new Error('공유 사용량 저장소 응답을 읽을 수 없습니다.')
  }
  if (count > limit) {
    return { ok: false, retryAfterSec, limit }
  }
  return { ok: true, count, limit }
}

function applyMemoryRateLimit(identifier) {
  const now = Date.now()
  const windowStart = now - RATE_LIMIT_WINDOW_MS
  const key = typeof identifier === 'string' && identifier ? identifier : 'unknown'
  const prev = RATE_LIMIT_STORE.get(key)
  const hits = (prev?.hits ?? []).filter((t) => t > windowStart)
  if (hits.length >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterMs = Math.max(1000, RATE_LIMIT_WINDOW_MS - (now - hits[0]))
    return { ok: false, retryAfterSec: Math.ceil(retryAfterMs / 1000) }
  }
  hits.push(now)
  RATE_LIMIT_STORE.set(key, { hits, updatedAt: now })

  if (RATE_LIMIT_STORE.size > 2000) {
    for (const [ip, value] of RATE_LIMIT_STORE.entries()) {
      if (!value || value.updatedAt < windowStart) RATE_LIMIT_STORE.delete(ip)
    }
  }
  return { ok: true }
}

export async function applyRateLimit(identifier) {
  const config = getSharedUsageStoreConfig()
  if (!config) return applyMemoryRateLimit(identifier)

  const windowId = Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS)
  const key = [
    USAGE_STORE_KEY_PREFIX,
    'rate',
    encodeUsageKeyPart(identifier),
    windowId,
  ].join(':')
  return incrementSharedUsageLimit({
    config,
    key,
    limit: RATE_LIMIT_MAX_REQUESTS,
    ttlSec: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
  })
}

function getLocalDayKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function secondsUntilNextLocalDay(date = new Date()) {
  const nextDay = new Date(date)
  nextDay.setHours(24, 0, 0, 0)
  return Math.max(1, Math.ceil((nextDay.getTime() - date.getTime()) / 1000))
}

function applyMemoryDailyUsageLimit(identifier, action) {
  if (!DAILY_USAGE_ACTIONS.has(action)) return { ok: true }

  const now = new Date()
  const today = getLocalDayKey(now)
  const key = typeof identifier === 'string' && identifier ? identifier : 'unknown'
  const prev = DAILY_USAGE_STORE.get(key)
  const count = prev?.dayKey === today ? Number(prev.count) || 0 : 0

  if (count >= DAILY_USAGE_MAX_REQUESTS) {
    return {
      ok: false,
      retryAfterSec: secondsUntilNextLocalDay(now),
      limit: DAILY_USAGE_MAX_REQUESTS,
    }
  }

  DAILY_USAGE_STORE.set(key, {
    dayKey: today,
    count: count + 1,
    updatedAt: now.getTime(),
  })

  if (DAILY_USAGE_STORE.size > 2000) {
    for (const [storeKey, value] of DAILY_USAGE_STORE.entries()) {
      if (!value || value.dayKey !== today) DAILY_USAGE_STORE.delete(storeKey)
    }
  }

  return { ok: true }
}

export async function applyDailyUsageLimit(identifier, action) {
  if (!DAILY_USAGE_ACTIONS.has(action)) return { ok: true }

  const config = getSharedUsageStoreConfig()
  if (!config) return applyMemoryDailyUsageLimit(identifier, action)

  const now = new Date()
  const key = [
    USAGE_STORE_KEY_PREFIX,
    'daily',
    getLocalDayKey(now),
    encodeUsageKeyPart(action),
    encodeUsageKeyPart(identifier),
  ].join(':')
  return incrementSharedUsageLimit({
    config,
    key,
    limit: DAILY_USAGE_MAX_REQUESTS,
    ttlSec: secondsUntilNextLocalDay(now),
    retryAfterSec: secondsUntilNextLocalDay(now),
  })
}

function normalizeImageMimeType(value) {
  if (typeof value !== 'string' || !value.trim()) return 'image/jpeg'
  return value.trim().toLowerCase()
}

function hasExpectedImageSignature(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false
  if (mimeType === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  }
  if (mimeType === 'image/png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    )
  }
  if (mimeType === 'image/webp') {
    return (
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    )
  }
  return false
}

export function validateImageInput(imageBase64, rawMimeType) {
  const mimeType = normalizeImageMimeType(rawMimeType)
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    return {
      ok: false,
      status: 415,
      error: '지원하지 않는 이미지 형식입니다. JPG, PNG, WEBP만 업로드해 주세요.',
    }
  }
  if (typeof imageBase64 !== 'string' || !imageBase64.trim()) {
    return { ok: false, status: 400, error: 'imageBase64가 필요합니다.' }
  }

  const data = imageBase64.trim().replace(/\s+/g, '')
  if (
    data.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(data) ||
    /=[^=]/.test(data)
  ) {
    return {
      ok: false,
      status: 400,
      error: '이미지 데이터가 올바른 base64 형식이 아닙니다.',
    }
  }

  const decoded = Buffer.from(data, 'base64')
  if (!decoded.length) {
    return {
      ok: false,
      status: 400,
      error: '이미지 데이터를 읽을 수 없습니다.',
    }
  }
  if (decoded.length > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      status: 413,
      error: '이미지 크기가 너무 큽니다. 더 작은 이미지로 다시 시도해 주세요.',
    }
  }
  if (!hasExpectedImageSignature(decoded, mimeType)) {
    return {
      ok: false,
      status: 400,
      error: '이미지 형식과 실제 파일 내용이 일치하지 않습니다.',
    }
  }

  return { ok: true, imageBase64: data, mimeType }
}

export function validateImagesInput(images, fallbackImageBase64, fallbackMimeType) {
  const list = Array.isArray(images)
    ? images
    : [{ imageBase64: fallbackImageBase64, mimeType: fallbackMimeType }]
  if (list.length < 1) {
    return { ok: false, status: 400, error: '이미지를 1장 이상 선택해 주세요.' }
  }
  if (list.length > MAX_REVIEW_IMAGE_COUNT) {
    return {
      ok: false,
      status: 400,
      error: `이미지는 최대 ${MAX_REVIEW_IMAGE_COUNT}장까지 업로드할 수 있습니다.`,
    }
  }

  const validImages = []
  for (const image of list) {
    const result = validateImageInput(image?.imageBase64, image?.mimeType)
    if (!result.ok) return result
    validImages.push({
      imageBase64: result.imageBase64,
      mimeType: result.mimeType,
    })
  }
  return { ok: true, images: validImages }
}

export function buildImageParts(images) {
  return images.map((image) => ({
    inline_data: {
      mime_type: image.mimeType,
      data: image.imageBase64,
    },
  }))
}

function parseAllowOrigins() {
  const raw = process.env.ALLOWED_ORIGINS
  if (typeof raw !== 'string' || !raw.trim()) return null
  const list = raw
    .split(',')
    .map((v) => v.trim())
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
    const u = new URL(origin)
    return u.host === host
  } catch {
    return false
  }
}

function getGoogleClientId() {
  return typeof process.env.GOOGLE_CLIENT_ID === 'string'
    ? process.env.GOOGLE_CLIENT_ID.trim()
    : ''
}

function getBearerToken(req) {
  const auth = req.headers?.authorization
  if (typeof auth !== 'string') return ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : ''
}

function hasValidAppToken(req) {
  const secret =
    typeof process.env.API_AUTH_TOKEN === 'string'
      ? process.env.API_AUTH_TOKEN.trim()
      : ''
  if (!secret) return true
  const headerToken = req.headers?.['x-api-auth-token']
  return typeof headerToken === 'string' && headerToken.trim() === secret
}

async function verifyGoogleToken(idToken) {
  const audience = getGoogleClientId()
  if (!audience) {
    return {
      ok: false,
      status: 500,
      error: '서버 설정 오류: GOOGLE_CLIENT_ID가 없습니다.',
    }
  }
  try {
    const ticket = await GOOGLE_OAUTH_CLIENT.verifyIdToken({
      idToken,
      audience,
    })
    const payload = ticket.getPayload()
    if (!payload?.sub) {
      return { ok: false, status: 401, error: '유효하지 않은 로그인 토큰입니다.' }
    }
    return { ok: true, userId: payload.sub }
  } catch {
    return { ok: false, status: 401, error: '로그인이 만료되었거나 유효하지 않습니다.' }
  }
}

async function authorizeRequest(req) {
  const googleClientId = getGoogleClientId()
  if (process.env.NODE_ENV === 'production') {
    if (!googleClientId) {
      return {
        ok: false,
        status: 500,
        error: '서버 설정 오류: 운영 환경에는 GOOGLE_CLIENT_ID가 필요합니다.',
      }
    }
    if (!hasConfiguredAllowOrigins()) {
      return {
        ok: false,
        status: 500,
        error: '서버 설정 오류: 운영 환경에는 ALLOWED_ORIGINS가 필요합니다.',
      }
    }
  }

  if (googleClientId) {
    const bearer = getBearerToken(req)
    if (!bearer) {
      return { ok: false, status: 401, error: 'Google 로그인이 필요합니다.' }
    }
    const verified = await verifyGoogleToken(bearer)
    if (!verified.ok) return verified
    if (process.env.NODE_ENV === 'production' && !isTrustedOrigin(req)) {
      return { ok: false, status: 403, error: '허용되지 않은 출처(origin)입니다.' }
    }
    return { ok: true, userId: verified.userId }
  }

  if (!hasValidAppToken(req)) {
    return { ok: false, status: 401, error: '인증되지 않은 요청입니다.' }
  }
  if (process.env.NODE_ENV === 'production' && !isTrustedOrigin(req)) {
    return { ok: false, status: 403, error: '허용되지 않은 출처(origin)입니다.' }
  }
  return { ok: true, userId: null }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function makeUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
}

function makeStreamUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`
}

function parseGeminiRetryAfterSeconds(message) {
  if (typeof message !== 'string') return null
  const m = message.match(/retry in ([\d.]+)\s*s/i)
  if (!m) return null
  const sec = Math.ceil(Number.parseFloat(m[1]))
  return Number.isFinite(sec) && sec > 0 ? sec : null
}

function isTemporaryHighDemandMessage(message) {
  if (typeof message !== 'string') return false
  return /currently experiencing high demand|spikes in demand are usually temporary|please try again later/i.test(
    message,
  )
}

export function humanizeGeminiApiError(status, rawMessage) {
  const msg = typeof rawMessage === 'string' ? rawMessage : ''
  if (isTemporaryHighDemandMessage(msg)) {
    return '현재 모델 요청이 몰려 일시적으로 처리 지연 중입니다. 잠시 후 다시 시도해 주세요.'
  }
  const quotaLike =
    status === 429 ||
    /quota exceeded|resource_exhausted|free_tier|rate.?limit|exceeded your current quota/i.test(
      msg,
    )
  if (!quotaLike) {
    return msg || `요청 실패 (HTTP ${status})`
  }
  const waitSec = parseGeminiRetryAfterSeconds(msg)
  const waitHint =
    waitSec != null ? ` 약 ${waitSec}초 뒤에 다시 시도해 보세요.` : ''
  return (
    `Gemini API 호출 한도에 걸렸습니다.${waitHint} ` +
    `Google AI Studio에서 API 키의 결제/플랜 연결 상태와 프로젝트 설정을 확인하세요. ` +
    `https://ai.google.dev/gemini-api/docs/rate-limits · https://ai.dev/rate-limit`
  )
}

export function sanitizeKeywordArray(arr) {
  if (!Array.isArray(arr)) return null
  const cleaned = arr
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(
      (s) =>
        s.length >= KEYWORD_LEN_MIN &&
        s.length <= KEYWORD_LEN_MAX &&
        hasHangul(s) &&
        isLikelyKeywordPhrase(s),
    )
  return cleaned.length ? Array.from(new Set(cleaned)) : null
}

function sanitizeKeywordsField(keywords) {
  if (Array.isArray(keywords)) return sanitizeKeywordArray(keywords)
  if (typeof keywords === 'string') {
    const parts = keywords
      .split(/[,、，\n|/]+/g)
      .map((s) => s.trim())
      .filter(Boolean)
    return sanitizeKeywordArray(parts)
  }
  return null
}

function stripEnglishJsonPreamble(str) {
  let s = str.trimStart()
  for (let i = 0; i < 3; i += 1) {
    const next = s
      .replace(
        /^(?:here\s+is\s+the\s+json\s+requested\s*\.?\s*[:：]?\s*|here\s+is\s+the\s+json\s*[:：]?\s*|below\s+is\s+the\s+json\s*[:：]?\s*|the\s+following\s+is\s+(?:the\s+)?json\s*[:：]?\s*|json\s+(?:output|response)\s*[:：]?\s*)/i,
        '',
      )
      .trimStart()
    if (next === s) break
    s = next
  }
  return s
}

function loosenJsonCommas(s) {
  return s.replace(/,\s*([\]}])/g, '$1')
}

function trimToJsonStart(s) {
  const a = s.indexOf('{')
  const b = s.indexOf('[')
  let i = -1
  if (a >= 0 && b >= 0) i = Math.min(a, b)
  else i = a >= 0 ? a : b
  return i > 0 ? s.slice(i) : s
}

function sliceBalancedSegment(str, openCh, closeCh) {
  const start = str.indexOf(openCh)
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < str.length; i += 1) {
    const c = str[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') {
      inStr = true
      continue
    }
    if (c === openCh) depth += 1
    else if (c === closeCh) {
      depth -= 1
      if (depth === 0) return str.slice(start, i + 1)
    }
  }
  return null
}

function extractQuotedHangulKeywords(text) {
  const re = /"((?:[^"\\]|\\.)*)"/g
  const out = []
  let m
  while ((m = re.exec(text)) !== null) {
    const s = m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim()
    if (
      s.length >= KEYWORD_LEN_MIN &&
      s.length <= KEYWORD_LEN_MAX &&
      hasHangul(s)
    ) {
      out.push(s)
    }
  }
  return out.length ? Array.from(new Set(out)) : null
}

function extractSingleQuotedHangulKeywords(text) {
  const re = /'((?:[^'\\]|\\.)*)'/g
  const out = []
  let m
  while ((m = re.exec(text)) !== null) {
    const s = m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\').trim()
    if (
      s.length >= KEYWORD_LEN_MIN &&
      s.length <= KEYWORD_LEN_MAX &&
      hasHangul(s)
    ) {
      out.push(s)
    }
  }
  return out.length ? Array.from(new Set(out)) : null
}

function mergeUniqueKeywordLists(...lists) {
  const flat = lists.filter(Boolean).flat()
  if (!flat.length) return null
  return Array.from(new Set(flat))
}

function gatherKeywordResponseText(data) {
  const chunks = []
  for (const cand of data?.candidates ?? []) {
    for (const part of cand?.content?.parts ?? []) {
      if (typeof part?.text === 'string' && part.text.trim()) {
        chunks.push(part.text.trim())
      }
    }
  }
  return chunks.join('\n')
}

export function parseKeywordsFromText(text) {
  if (typeof text !== 'string' || !text.trim()) return null
  const raw = text.trim()
  let normalized = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
  normalized = stripEnglishJsonPreamble(normalized)
  normalized = trimToJsonStart(normalized)
  const loose = loosenJsonCommas(normalized)

  const tryParse = (s) => {
    try {
      return JSON.parse(s)
    } catch {
      return null
    }
  }

  for (const candidate of [normalized, loose]) {
    const parsed = tryParse(candidate)
    if (parsed) {
      const fromObject = sanitizeKeywordsField(parsed?.keywords)
      if (fromObject) return fromObject
      const fromArray = sanitizeKeywordArray(parsed)
      if (fromArray) return fromArray
    }
  }

  const objSlice = sliceBalancedSegment(normalized, '{', '}')
  if (objSlice) {
    const parsed = tryParse(loosenJsonCommas(objSlice))
    const fromObject = parsed ? sanitizeKeywordsField(parsed?.keywords) : null
    if (fromObject) return fromObject
  }

  const arraySlice = sliceBalancedSegment(normalized, '[', ']')
  if (arraySlice) {
    const parsed = tryParse(loosenJsonCommas(arraySlice))
    const fromArray = parsed ? sanitizeKeywordArray(parsed) : null
    if (fromArray) return fromArray
  }

  const fromLines = sanitizeKeywordArray(
    normalized
      .split('\n')
      .map((line) => line.replace(/^[\s\-*0-9.()]+/, '').trim())
      .filter(Boolean),
  )
  if (fromLines) return fromLines

  const fromAnyQuotes = mergeUniqueKeywordLists(
    extractQuotedHangulKeywords(normalized),
    extractSingleQuotedHangulKeywords(normalized),
  )
  if (fromAnyQuotes) return fromAnyQuotes

  return null
}

function parseKeywordsFromAny(data) {
  const text = gatherKeywordResponseText(data)
  const direct = parseKeywordsFromText(text)
  if (direct && direct.length >= 1) {
    if (direct.length < KEYWORDS_MIN_COUNT) {
      return { keywords: null, rawText: text, tooFew: true, partial: direct }
    }
    return { keywords: direct.slice(0, KEYWORDS_MAX_COUNT), rawText: text }
  }

  const tokenized = text
    .replace(/^키워드\s*[:：]?\s*/i, '')
    .split(/[,、，\n|/]+/g)
    .map((v) => v.replace(/^[\s\-*0-9.()]+/, '').trim())
    .filter(Boolean)
  const cleaned = Array.from(new Set(tokenized)).filter(
    (v) =>
      v.length >= KEYWORD_LEN_MIN &&
      v.length <= KEYWORD_LEN_MAX &&
      hasHangul(v),
  )
  if (cleaned.length >= KEYWORDS_MIN_COUNT) {
    return { keywords: cleaned.slice(0, KEYWORDS_MAX_COUNT), rawText: text }
  }
  if (cleaned.length >= 1) {
    return { keywords: null, rawText: text, tooFew: true, partial: cleaned }
  }
  return { keywords: null, rawText: text }
}

export function buildKeywordGenerationConfig() {
  return {
    temperature: 0.1,
    maxOutputTokens: KEYWORDS_MAX_OUTPUT_TOKENS,
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'object',
      properties: {
        keywords: {
          type: 'array',
          items: { type: 'string' },
          minItems: KEYWORDS_MIN_COUNT,
          maxItems: KEYWORDS_MAX_COUNT,
        },
      },
      required: ['keywords'],
    },
    thinkingConfig: {
      thinkingBudget: 0,
    },
  }
}

export function buildReviewGenerationConfig(length) {
  return {
    temperature: 0.6,
    maxOutputTokens: REVIEW_MAX_OUTPUT_TOKENS[length] ?? REVIEW_MAX_OUTPUT_TOKENS.medium,
    thinkingConfig: {
      thinkingBudget: 0,
    },
  }
}

function summarizeKeywordDebug(data) {
  const candidates = Array.isArray(data?.candidates) ? data.candidates : []
  const first = candidates[0]
  return {
    candidateCount: candidates.length,
    finishReason: first?.finishReason ?? null,
    blockReason: data?.promptFeedback?.blockReason ?? null,
  }
}

function describeKeywordGeminiIssue(data, extractedText) {
  const blockReason = data?.promptFeedback?.blockReason
  if (blockReason) {
    return '입력이 정책에 의해 차단되었습니다. 다른 이미지로 시도해 주세요.'
  }
  const cand = data?.candidates?.[0]
  if (!cand) {
    return '모델이 응답 후보를 반환하지 않았습니다. 잠시 후 다시 시도해 주세요.'
  }
  const hasText =
    typeof extractedText === 'string' && extractedText.trim().length > 0
  const fr = cand.finishReason
  if (fr === 'MAX_TOKENS') {
    return '응답이 중간에 잘렸습니다. 키워드 다시 생성을 눌러 주세요.'
  }
  if (!hasText) {
    if (
      fr === 'SAFETY' ||
      fr === 'PROHIBITED_CONTENT' ||
      fr === 'IMAGE_SAFETY' ||
      fr === 'IMAGE_PROHIBITED_CONTENT'
    ) {
      return '안전 정책으로 인해 키워드를 생성할 수 없습니다. 다른 이미지로 시도해 주세요.'
    }
    if (fr === 'RECITATION') {
      return '저작권 정책으로 인해 응답을 생성할 수 없습니다.'
    }
    if (fr && fr !== 'STOP') {
      return `모델이 텍스트 응답을 만들지 못했습니다. (${fr})`
    }
    return '모델이 빈 응답을 반환했습니다. 다시 시도해 주세요.'
  }
  return null
}

function normalizeReviewText(text) {
  return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : ''
}

async function requestGemini({ key, payload, maxRetries = MAX_RETRIES }) {
  let lastError = null
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetch(makeUrl(MODEL), {
        method: 'POST',
        headers: createJsonHeaders({ 'x-goog-api-key': key }),
        body: JSON.stringify(payload),
      })
      const data = await readJsonSafely(response)
      if (response.ok) return { ok: true, data, model: MODEL }

      const rawMessage =
        data?.error?.message ?? `요청 실패 (HTTP ${response.status})`
      const message = humanizeGeminiApiError(response.status, rawMessage)
      if (response.status === 429) {
        const highDemand = isTemporaryHighDemandMessage(rawMessage)
        if (highDemand && attempt < maxRetries) {
          const retryAfterSec = parseGeminiRetryAfterSeconds(rawMessage) ?? 2
          await wait(Math.min(6000, retryAfterSec * 1000))
          continue
        }
        return { ok: false, error: message, status: response.status }
      }
      if (!RETRYABLE_STATUS.has(response.status) || attempt === maxRetries) {
        return { ok: false, error: message, status: response.status }
      }
      await wait(700 * 2 ** attempt)
    } catch (err) {
      lastError = err
      if (attempt === maxRetries) break
      await wait(700 * 2 ** attempt)
    }
  }
  const message =
    lastError instanceof Error ? lastError.message : '네트워크 또는 알 수 없는 오류'
  return { ok: false, error: message }
}

async function streamGeminiReview({
  key,
  rating,
  keywords,
  length,
  tone,
  category,
  res,
}) {
  const { prompt, safeLength, minReviewChars } = buildReviewPrompt({
    rating,
    keywords,
    length,
    tone,
    category,
  })

  const response = await fetch(makeStreamUrl(MODEL), {
    method: 'POST',
    headers: createJsonHeaders({ 'x-goog-api-key': key }),
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: buildReviewGenerationConfig(safeLength),
    }),
  })

  if (!response.ok) {
    const data = await readJsonSafely(response)
    const raw = data?.error?.message || '리뷰 생성 실패'
    throw new Error(humanizeGeminiApiError(response.status, raw))
  }
  if (!response.body) {
    throw new Error('스트리밍 응답 본문이 없습니다.')
  }

  res.statusCode = 200
  setCommonSecurityHeaders(res)
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('X-Accel-Buffering', 'no')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''
  let finishReason = null
  const writeJsonLine = (payload) => {
    res.write(`${JSON.stringify(payload)}\n`)
  }

  const handleSsePayload = (payload) => {
    if (!payload || payload === '[DONE]') return
    try {
      const jsonData = JSON.parse(payload)
      finishReason = jsonData?.candidates?.[0]?.finishReason ?? finishReason
      const text = jsonData?.candidates?.[0]?.content?.parts?.[0]?.text
      if (text) {
        fullText += text
        writeJsonLine({ text })
      }
    } catch {
      void 0
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        handleSsePayload(line.slice(6).trim())
      }
    }

    if (buffer.trim()) {
      for (const line of buffer.split('\n')) {
        if (!line.startsWith('data: ')) continue
        handleSsePayload(line.slice(6).trim())
      }
    }
  } catch (err) {
    writeJsonLine({
      error: err instanceof Error ? err.message : '스트리밍 응답을 읽지 못했습니다.',
    })
    return res.end()
  }

  const normalizedReview = normalizeReviewText(fullText)
  if (finishReason === 'MAX_TOKENS') {
    writeJsonLine({
      error: '리뷰가 중간에 잘렸습니다. 글자수보다 완성된 리뷰를 우선해 다시 생성해 주세요.',
    })
    return res.end()
  }
  if (normalizedReview.length < minReviewChars) {
    writeJsonLine({ error: '리뷰가 너무 짧게 생성되었습니다. 다시 생성해 주세요.' })
    return res.end()
  }
  writeJsonLine({ done: true, finishReason })
  res.end()
}

function toClientErrorStatus(status) {
  if (!Number.isInteger(status)) return 502
  if (status >= 400 && status <= 599) return status
  return 502
}

async function readJsonBody(req) {
  const chunks = []
  let totalBytes = 0
  for await (const chunk of req) {
    const size = Buffer.isBuffer(chunk)
      ? chunk.length
      : Buffer.byteLength(String(chunk))
    totalBytes += size
    if (totalBytes > MAX_REQUEST_BODY_BYTES) {
      return { tooLarge: true }
    }
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function rejectDailyUsageLimit(res, identifier, action) {
  let dailyUsage
  try {
    dailyUsage = await applyDailyUsageLimit(identifier, action)
  } catch {
    json(res, 503, {
      ok: false,
      error: '사용량 제한 저장소를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    })
    return true
  }
  if (dailyUsage.ok) return false

  res.setHeader('Retry-After', String(dailyUsage.retryAfterSec))
  json(res, 429, {
    ok: false,
    error: `일일 요청 한도(${dailyUsage.limit}회)를 초과했습니다. 내일 다시 시도해 주세요.`,
  })
  return true
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'Method Not Allowed' })
  }

  const auth = await authorizeRequest(req)
  if (!auth.ok) {
    return json(res, auth.status, { ok: false, error: auth.error })
  }

  const rateKey = auth.userId
    ? `user:${auth.userId}`
    : `ip:${getClientIp(req) || 'unknown'}`
  let rate
  try {
    rate = await applyRateLimit(rateKey)
  } catch {
    return json(res, 503, {
      ok: false,
      error: '요청 제한 저장소를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    })
  }
  if (!rate.ok) {
    res.setHeader('Retry-After', String(rate.retryAfterSec))
    return json(res, 429, {
      ok: false,
      error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    })
  }

  const key =
    typeof process.env.GEMINI_API_KEY === 'string'
      ? process.env.GEMINI_API_KEY.trim()
      : ''
  if (!key) {
    return json(res, 500, {
      ok: false,
      error: '서버 환경변수 GEMINI_API_KEY가 없습니다.',
    })
  }

  const body = await readJsonBody(req)
  if (body?.tooLarge) {
    return json(res, 413, {
      ok: false,
      error: '요청 본문이 너무 큽니다. 이미지 크기를 줄여 다시 시도해 주세요.',
    })
  }
  if (!body) {
    return json(res, 400, { ok: false, error: '잘못된 JSON 본문입니다.' })
  }

  if (body.action === 'ping') {
    return json(res, 200, { ok: true, model: MODEL })
  }

  if (body.action === 'keywords') {
    const rawRating = Number.isFinite(Number(body.rating)) ? Number(body.rating) : 5
    const rating = Math.max(1, Math.min(5, rawRating))
    const imageInput = validateImagesInput(
      body.images,
      body.imageBase64,
      body.mimeType,
    )

    if (!imageInput.ok) {
      return json(res, imageInput.status, {
        ok: false,
        error: imageInput.error,
      })
    }

    if (await rejectDailyUsageLimit(res, rateKey, body.action)) return
    const previousKeywords = sanitizeKeywordArray(body.previousKeywords)

    const prompt = buildKeywordPrompt({
      rating,
      category: body.category,
      imageCount: imageInput.images.length,
      minKeywordCount: KEYWORDS_MIN_COUNT,
      maxKeywordCount: KEYWORDS_MAX_COUNT,
      previousKeywords,
    })
    const imageParts = buildImageParts(imageInput.images)
    const buildKeywordPayload = (text) => ({
      contents: [
        {
          parts: [
            ...imageParts,
            { text },
          ],
        },
      ],
      generationConfig: buildKeywordGenerationConfig(),
    })

    const rejectedKeywordSets = previousKeywords.length ? [previousKeywords] : []
    let result = null
    let parsed = null
    let sawDuplicate = false

    for (let attempt = 0; attempt < KEYWORD_RETRY_LIMIT; attempt += 1) {
      const promptForAttempt =
        attempt === 0
          ? prompt
          : appendKeywordRetryGuidance(prompt, rejectedKeywordSets)

      result = await requestGemini({
        key,
        payload: buildKeywordPayload(promptForAttempt),
      })
      if (!result.ok) {
        return json(res, toClientErrorStatus(result.status), result)
      }

      parsed = parseKeywordsFromAny(result.data)
      if (!parsed.keywords || parsed.keywords.length < KEYWORDS_MIN_COUNT) {
        break
      }

      const isDuplicate = rejectedKeywordSets.some((set) =>
        isSameKeywordSet(parsed.keywords, set),
      )
      if (!isDuplicate) {
        return json(res, 200, {
          ok: true,
          keywords: parsed.keywords,
          model: result.model,
        })
      }
      rejectedKeywordSets.push(parsed.keywords)
      sawDuplicate = true
      parsed = null
    }

    if (parsed?.tooFew) {
      const n = parsed.partial?.length ?? 0
      if (DEBUG_LOGS) {
        console.warn('[gemini keywords] too few after filter', {
          count: n,
          ...summarizeKeywordDebug(result.data),
        })
      }
      return json(res, 502, {
        ok: false,
        error: `키워드가 ${n}개뿐입니다. 최소 ${KEYWORDS_MIN_COUNT}개(권장 4~8개)가 필요합니다. 다시 생성해 주세요.`,
      })
    }

    if (sawDuplicate) {
      return json(res, 502, {
        ok: false,
        error: '이전과 같은 키워드만 반복 생성되었습니다. 다시 시도해 주세요.',
      })
    }

    const apiIssue = describeKeywordGeminiIssue(result.data, parsed?.rawText)
    if (DEBUG_LOGS) {
      console.warn('[gemini keywords] parse failed', {
        apiIssue,
        ...summarizeKeywordDebug(result.data),
      })
    }
    return json(res, 502, {
      ok: false,
      error:
        apiIssue ??
        '키워드 형식을 읽을 수 없습니다. 키워드 다시 생성을 눌러 주세요.',
    })
  }

  if (body.action === 'review') {
    const rating = Number.isFinite(Number(body.rating)) ? Number(body.rating) : 5
    const tone = normalizeReviewTone(body.tone)
    if (await rejectDailyUsageLimit(res, rateKey, body.action)) return
    try {
      await streamGeminiReview({
        key,
        rating,
        keywords: body.keywords,
        length: body.length,
        tone,
        category: body.category,
        res,
      })
      return
    } catch (err) {
      return json(res, 502, {
        ok: false,
        error: err instanceof Error ? err.message : '리뷰 생성 실패',
      })
    }
  }

  return json(res, 400, { ok: false, error: '지원하지 않는 action입니다.' })
}

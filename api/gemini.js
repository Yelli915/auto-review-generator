/* global Buffer, process */
import { OAuth2Client } from 'google-auth-library'
import { createJsonHeaders, readJsonSafely } from '../shared/httpJson.js'

const MODELS = ['gemini-2.5-flash']
/** 429는 쿼터·RPM이라 즉시 반환(재시도 안 함). 나머지만 백오프 재시도 */
const RETRYABLE_STATUS = new Set([500, 502, 503, 504])
const MAX_RETRIES = 2
const STREAM_MODEL = 'gemini-2.5-flash'

const REVIEW_LENGTH_MAP = {
  short: '2~3문장 이내로 간결하게',
  medium: '4~5문장 분량으로',
  long: '7~8문장의 상세한 내용으로',
}

const REVIEW_TONE_MAP = {
  neutral:
    '1인칭 구매자 입장의 자연스러운 온라인 쇼핑몰 리뷰 말투. 과장하지 말 것.',
  friendly:
    '친근하고 부드러운 말투. 이모티콘·느낌표 남발은 피할 것.',
  formal:
    '정중한 존댓말(~습니다·해요체)로 격식 있게. 무례하지 않게.',
  casual:
    '편한 일상 반말(~했어, ~야 느낌). 공격적·무례한 표현은 금지.',
}

const MAX_OUTPUT_TOKENS = {
  short: 220,
  medium: 360,
  long: 520,
}

/** 키워드 칩·토큰 폴백 공통 길이 (한국어 짧은 구) */
const KEYWORD_LEN_MIN = 2
const KEYWORD_LEN_MAX = 30

const KEYWORDS_MAX_OUTPUT_TOKENS = 320
const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_MAX_REQUESTS = 20
const RATE_LIMIT_STORE = new Map()
const DEBUG_LOGS =
  process.env.NODE_ENV !== 'production' || process.env.GEMINI_DEBUG_LOGS === '1'
const GOOGLE_OAUTH_CLIENT = new OAuth2Client()

/** 서로 다른 키워드 개수(한글 필터 통과 후) */
const KEYWORDS_MIN_COUNT = 3
const KEYWORDS_MAX_COUNT = 8
const REVIEW_MIN_CHARS = {
  short: 20,
  medium: 45,
  long: 80,
}

function keywordSentimentGuide(rating) {
  if (rating <= 1) {
    return '전반적으로 매우 불만족 톤. 부정 키워드 위주로 제안.'
  }
  if (rating <= 2) {
    return '불만족 톤. 부정 키워드를 중심으로 하되 사실 기반으로 제안.'
  }
  if (rating < 4) {
    return '보통 톤. 장단점이 섞인 중립 키워드 위주로 제안.'
  }
  if (rating < 5) {
    return '만족 톤. 긍정 키워드를 중심으로 제안.'
  }
  return '매우 만족 톤. 강한 긍정 키워드를 중심으로 제안.'
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function setCommonSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('X-Frame-Options', 'DENY')
}

function normalizeIp(raw) {
  if (typeof raw !== 'string') return ''
  return raw.trim().replace(/^::ffff:/, '')
}

function isValidIp(ip) {
  if (typeof ip !== 'string' || !ip) return false
  // Basic IPv4 / IPv6 validation for rate-limit key usage.
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

function applyRateLimit(identifier) {
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

function parseAllowOrigins() {
  const raw = process.env.ALLOWED_ORIGINS
  if (typeof raw !== 'string' || !raw.trim()) return null
  const list = raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
  return list.length ? new Set(list) : null
}

function isTrustedOrigin(req) {
  const origin = req.headers?.origin
  if (typeof origin !== 'string' || !origin.trim()) return false
  const allowSet = parseAllowOrigins()
  if (allowSet) return allowSet.has(origin)
  const host = req.headers?.host
  if (typeof host !== 'string' || !host.trim()) return false
  try {
    const u = new URL(origin)
    return u.host === host
  } catch {
    return false
  }
}

function hasValidAppToken(req) {
  const secret =
    typeof process.env.API_AUTH_TOKEN === 'string'
      ? process.env.API_AUTH_TOKEN.trim()
      : ''
  if (!secret) return true
  const headerToken = req.headers?.['x-api-auth-token']
  if (typeof headerToken !== 'string') return false
  return headerToken.trim() === secret
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
  if (!m) return ''
  return m[1].trim()
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
  if (process.env.NODE_ENV === 'production' && !googleClientId) {
    return {
      ok: false,
      status: 500,
      error: '서버 설정 오류: 운영 환경에는 GOOGLE_CLIENT_ID가 필요합니다.',
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
  if (process.env.NODE_ENV === 'production') {
    if (!isTrustedOrigin(req)) {
      return { ok: false, status: 403, error: '허용되지 않은 출처(origin)입니다.' }
    }
  }
  return { ok: true, userId: null }
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

/** 무료 한도·RPM 등 쿼터 관련 응답을 사용자용 한국어로 */
function humanizeGeminiApiError(status, rawMessage) {
  const msg = typeof rawMessage === 'string' ? rawMessage : ''
  if (isTemporaryHighDemandMessage(msg)) {
    return '현재 모델 요청이 몰려 일시적으로 처리 지연 중입니다. 잠시 후 자동/수동으로 다시 시도해 주세요.'
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
    `Gemini API 호출 한도에 걸렸습니다. 메시지에 따르면 아직 무료 등급(free tier) 요청 한도로 집계되고 있습니다.${waitHint} ` +
    `Google AI Studio에서 이 API 키의 결제·플랜을 연결했는지, 프로젝트가 맞는지 확인하세요. ` +
    `https://ai.google.dev/gemini-api/docs/rate-limits · https://ai.dev/rate-limit`
  )
}

function makeUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
}

function makeStreamUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`
}

/** 첫 번째 균형 잡힌 `{…}` 또는 `[…]` 구간 (문자열 안의 괄호는 무시) */
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

function hasHangul(s) {
  return /[\uAC00-\uD7A3]/.test(s)
}

/** 모델이 붙이는 영어 안내 줄을 제거해 JSON 파싱이 되도록 함 */
function stripEnglishJsonPreamble(str) {
  let s = str.trimStart()
  for (let i = 0; i < 3; i += 1) {
    const next = s
      .replace(
        /^(?:here\s+is\s+the\s+json\s+requested\s*\.?\s*[:：]?\s*|here\s+is\s+the\s+json\s*[:：]\s*|below\s+is\s+the\s+json\s*[:：]?\s*|the\s+following\s+is\s+(?:the\s+)?json\s*[:：]?\s*|json\s+(?:output|response)\s*[:：]?\s*)/i,
        '',
      )
      .trimStart()
    if (next === s) break
    s = next
  }
  return s
}

function isLikelyKeywordPhrase(value) {
  if (typeof value !== 'string') return false
  const s = value.trim()
  if (!s) return false
  if (/[,:;!?]/.test(s)) return false
  if (/["'`]/.test(s)) return false
  if (/\s{2,}/.test(s)) return false
  if (s.split(/\s+/).length > 4) return false
  if (
    /(합니다|해요|했어요|입니다|있어요|없어요|같아요|느껴져|느껴지|느껴|추천해요|바르는 순간)$/u.test(
      s,
    )
  ) {
    return false
  }
  return true
}

function sanitizeKeywordArray(arr) {
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

/** keywords 필드가 배열이 아니라 "a, b, c" 한 줄일 때 */
function sanitizeKeywordsField(keywords) {
  if (Array.isArray(keywords)) return sanitizeKeywordArray(keywords)
  if (typeof keywords === 'string') {
    const parts = keywords
      .split(/[,，、\n|/]+/g)
      .map((s) => s.trim())
      .filter(Boolean)
    return sanitizeKeywordArray(parts)
  }
  return null
}

/** JSON 이외·깨진 JSON에서 큰따옴표 문자열 중 한글 구만 모음 */
function extractQuotedHangulKeywords(text) {
  const re = /"((?:[^"\\]|\\.)*)"/g
  const out = []
  let m
  while ((m = re.exec(text)) !== null) {
    const s = m[1]
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .trim()
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
    const s = m[1]
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\')
      .trim()
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

function trimToJsonStart(s) {
  const a = s.indexOf('{')
  const b = s.indexOf('[')
  let i = -1
  if (a >= 0 && b >= 0) i = Math.min(a, b)
  else i = a >= 0 ? a : b
  return i > 0 ? s.slice(i) : s
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

function loosenJsonCommas(s) {
  return s.replace(/,\s*([\]}])/g, '$1')
}

function parseKeywordsFromText(text) {
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
    if (parsed) {
      const fromObject = sanitizeKeywordsField(parsed?.keywords)
      if (fromObject) return fromObject
    }
  }

  const arraySlice = sliceBalancedSegment(normalized, '[', ']')
  if (arraySlice) {
    const parsed = tryParse(loosenJsonCommas(arraySlice))
    if (parsed) {
      const fromArray = sanitizeKeywordArray(parsed)
      if (fromArray) return fromArray
    }
  }

  const lines = normalized
    .split('\n')
    .map((line) => line.replace(/^[\s\-*0-9.]+/, '').trim())
    .filter(Boolean)
  const fromLines = sanitizeKeywordArray(lines)
  if (fromLines) return fromLines

  const keywordArrayHint = normalized.match(/"keywords"\s*:\s*\[([\s\S]*)$/i)
  if (keywordArrayHint) {
    const quoted = new RegExp(
      `"([^"\\n]{${KEYWORD_LEN_MIN},${KEYWORD_LEN_MAX}})"`,
      'g',
    )
    const candidates = Array.from(
      keywordArrayHint[1].matchAll(quoted),
    ).map((m) => m[1])
    const fromHint = sanitizeKeywordArray(candidates)
    if (fromHint) return fromHint
  }

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
    return {
      keywords: direct.slice(0, KEYWORDS_MAX_COUNT),
      rawText: text,
    }
  }

  const tokenized = text
    .replace(/^키워드\s*[:：]\s*/i, '')
    .split(/[,，、·•\n|/]+/g)
    .map((v) => v.replace(/^[\s\-*0-9.()]+/, '').trim())
    .filter(Boolean)
  const cleaned = Array.from(new Set(tokenized)).filter(
    (v) =>
      v.length >= KEYWORD_LEN_MIN &&
      v.length <= KEYWORD_LEN_MAX &&
      hasHangul(v),
  )
  if (cleaned.length >= KEYWORDS_MIN_COUNT) {
    return {
      keywords: cleaned.slice(0, KEYWORDS_MAX_COUNT),
      rawText: text,
    }
  }
  if (cleaned.length >= 1) {
    return { keywords: null, rawText: text, tooFew: true, partial: cleaned }
  }

  return { keywords: null, rawText: text }
}

function summarizeKeywordDebug(data, rawText) {
  const candidates = Array.isArray(data?.candidates) ? data.candidates : []
  const first = candidates[0]
  const preview =
    typeof rawText === 'string' && rawText.trim()
      ? rawText.trim().slice(0, 1500)
      : ''

  return {
    candidateCount: candidates.length,
    finishReason: first?.finishReason ?? null,
    blockReason: data?.promptFeedback?.blockReason ?? null,
    promptFeedback: data?.promptFeedback ?? null,
    preview,
  }
}

function normalizeReviewText(text) {
  return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : ''
}

/** 파싱 실패 시 사용자에게 줄 수 있는 API/안전 관련 설명 (텍스트 없음·차단 등) */
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
      return `모델이 텍스트 응답을 만들지 않았습니다. (${fr})`
    }
    return '모델이 빈 응답을 반환했습니다. 다시 시도해 주세요.'
  }

  return null
}

async function requestGemini({ key, payload, maxRetries = MAX_RETRIES }) {
  const model = MODELS[0]
  let lastError = null

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetch(makeUrl(model), {
        method: 'POST',
        headers: createJsonHeaders({ 'x-goog-api-key': key }),
        body: JSON.stringify(payload),
      })

      const data = await readJsonSafely(response)

      if (response.ok) return { ok: true, data, model }

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
        return {
          ok: false,
          error: message,
          status: response.status,
          details: data,
        }
      }

      if (!RETRYABLE_STATUS.has(response.status) || attempt === maxRetries) {
        return {
          ok: false,
          error: message,
          status: response.status,
          details: data,
        }
      }

      await wait(700 * 2 ** attempt)
    } catch (err) {
      lastError = err
      if (attempt === maxRetries) break
      await wait(700 * 2 ** attempt)
    }
  }

  const message =
    lastError instanceof Error
      ? lastError.message
      : '네트워크 또는 알 수 없는 오류'
  return { ok: false, error: message }
}

async function streamGeminiReview({ key, rating, keywords, length, tone, res }) {
  const safeKeywords = Array.isArray(keywords)
    ? keywords
        .filter((v) => typeof v === 'string' && v.trim())
        .map((v) => v.trim())
        .filter((v) => isLikelyKeywordPhrase(v))
    : []
  const safeLength = REVIEW_LENGTH_MAP[length] ? length : 'medium'
  const safeTone = REVIEW_TONE_MAP[tone] ? tone : 'neutral'
  const minReviewChars = REVIEW_MIN_CHARS[safeLength] ?? 45

  const prompt =
    `키워드: ${safeKeywords.join(', ')}\n별점: ${rating}점\n길이: ${REVIEW_LENGTH_MAP[safeLength]}\n말투: ${REVIEW_TONE_MAP[safeTone]}\n\n` +
    `위 조건을 모두 지켜 리뷰 본문만 작성해. 제목·머리말·번호 목록 없이, 최소 ${minReviewChars}자 이상 완결된 문장으로 써 줘.`

  const response = await fetch(makeStreamUrl(STREAM_MODEL), {
    method: 'POST',
    headers: createJsonHeaders({ 'x-goog-api-key': key }),
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: MAX_OUTPUT_TOKENS[safeLength] ?? 280 },
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

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload)
        finishReason = json?.candidates?.[0]?.finishReason ?? finishReason
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) {
          fullText += text
          res.write(`${JSON.stringify({ text })}\n`)
        }
      } catch {
        void 0
      }
    }
  }

  if (buffer.startsWith('data: ')) {
    const payload = buffer.slice(6).trim()
    if (payload && payload !== '[DONE]') {
      try {
        const json = JSON.parse(payload)
        finishReason = json?.candidates?.[0]?.finishReason ?? finishReason
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) {
          fullText += text
          res.write(`${JSON.stringify({ text })}\n`)
        }
      } catch {
        void 0
      }
    }
  }

  const normalizedReview = normalizeReviewText(fullText)
  if (finishReason === 'MAX_TOKENS') {
    res.write(
      `${JSON.stringify({ error: '응답이 중간에 잘렸습니다. 리뷰 다시 생성을 눌러 주세요.' })}\n`,
    )
    return res.end()
  }
  if (normalizedReview.length < minReviewChars) {
    res.write(
      `${JSON.stringify({ error: '리뷰가 너무 짧게 생성되었습니다. 다시 생성해 주세요.' })}\n`,
    )
    return res.end()
  }

  res.write(`${JSON.stringify({ done: true, finishReason })}\n`)
  res.end()
}

function json(res, code, body) {
  res.statusCode = code
  setCommonSecurityHeaders(res)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'Method Not Allowed' })
  }
  const auth = await authorizeRequest(req)
  if (!auth.ok) {
    return json(res, auth.status, { ok: false, error: auth.error })
  }
  const rateKey = auth.userId ? `user:${auth.userId}` : `ip:${getClientIp(req) || 'unknown'}`
  const rate = applyRateLimit(rateKey)
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
    const result = await requestGemini({
      key,
      payload: { contents: [{ parts: [{ text: 'hello' }] }] },
    })
    return json(res, result.ok ? 200 : toClientErrorStatus(result.status), result)
  }

  if (body.action === 'keywords') {
    const imageBase64 = body.imageBase64
    const rawRating = Number.isFinite(Number(body.rating)) ? Number(body.rating) : 5
    const rating = Math.max(1, Math.min(5, rawRating))
    const mimeType =
      typeof body.mimeType === 'string' && body.mimeType
        ? body.mimeType
        : 'image/jpeg'

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return json(res, 400, { ok: false, error: 'imageBase64가 필요합니다.' })
    }

    const prompt =
      `이미지에 맞는 리뷰 키워드를 한국어 짧은 구로만 작성해. 별점 ${rating}점 기준 감정은 ${keywordSentimentGuide(rating)} ` +
      `서로 다른 키워드를 ${KEYWORDS_MIN_COUNT}~${KEYWORDS_MAX_COUNT}개 작성하고, 모든 값은 한글을 포함해야 해. ` +
      '설명, 서문, 코드블록, 영어 문장 없이 JSON만 출력해. ' +
      '형식: {"keywords":["...","...","..."]}'
    const result = await requestGemini({
      key,
      payload: {
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: mimeType,
                  data: imageBase64,
                },
              },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: KEYWORDS_MAX_OUTPUT_TOKENS,
          responseMimeType: 'application/json',
          responseJsonSchema: {
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
        },
      },
    })

    if (!result.ok) {
      return json(res, toClientErrorStatus(result.status), result)
    }

    const firstParsed = parseKeywordsFromAny(result.data)
    if (
      firstParsed.keywords &&
      firstParsed.keywords.length >= KEYWORDS_MIN_COUNT
    ) {
      return json(res, 200, {
        ok: true,
        keywords: firstParsed.keywords,
        model: result.model,
      })
    }

    if (firstParsed.tooFew) {
      const n = firstParsed.partial?.length ?? 0
      if (DEBUG_LOGS) {
        console.warn('[gemini keywords] too few after filter', {
          count: n,
          partial: firstParsed.partial ?? [],
          ...summarizeKeywordDebug(result.data, firstParsed.rawText),
        })
      }
      return json(res, 502, {
        ok: false,
        error: `키워드가 ${n}개뿐입니다. 최소 ${KEYWORDS_MIN_COUNT}개(권장 4~8개)가 필요합니다. 다시 생성해 주세요.`,
      })
    }

    const apiIssue = describeKeywordGeminiIssue(
      result.data,
      firstParsed.rawText,
    )
    if (DEBUG_LOGS) {
      console.warn('[gemini keywords] parse failed', {
        apiIssue,
        ...summarizeKeywordDebug(result.data, firstParsed.rawText),
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
    const keywords = body.keywords
    const length = body.length
    const tone =
      typeof body.tone === 'string' && REVIEW_TONE_MAP[body.tone]
        ? body.tone
        : 'neutral'

    try {
      await streamGeminiReview({
        key,
        rating,
        keywords,
        length,
        tone,
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

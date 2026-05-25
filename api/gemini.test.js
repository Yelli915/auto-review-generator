/* global process */
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import test from 'node:test'
import handler, {
  applyDailyUsageLimit,
  applyRateLimit,
  buildImageParts,
  buildKeywordGenerationConfig,
  buildReviewGenerationConfig,
  appendKeywordRetryGuidance,
  humanizeGeminiApiError,
  isSameKeywordSet,
  parseKeywordsFromText,
  sanitizeKeywordArray,
  validateImageInput,
  validateImagesInput,
} from './gemini.js'
import { normalizeReviewCategory } from '../shared/reviewCategories.js'
import { Readable } from 'node:stream'

const png1x1Base64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='

delete process.env.UPSTASH_REDIS_REST_URL
delete process.env.UPSTASH_REDIS_REST_TOKEN

function createMockRequest(body, headers = {}) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))])
  req.method = 'POST'
  req.headers = headers
  req.socket = { remoteAddress: '127.0.0.1' }
  return req
}

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value
    },
    end(chunk = '') {
      this.body += chunk
    },
    write(chunk = '') {
      this.body += chunk
    },
  }
}

test('validateImageInput accepts supported image content', () => {
  const result = validateImageInput(`\n${png1x1Base64}\n`, 'IMAGE/PNG')

  assert.equal(result.ok, true)
  assert.equal(result.mimeType, 'image/png')
  assert.equal(result.imageBase64, png1x1Base64)
})

test('handler ping works without auth or Gemini environment variables', async () => {
  const oldGeminiKey = process.env.GEMINI_API_KEY
  const oldGoogleClientId = process.env.GOOGLE_CLIENT_ID
  const oldAllowedOrigins = process.env.ALLOWED_ORIGINS
  delete process.env.GEMINI_API_KEY
  delete process.env.GOOGLE_CLIENT_ID
  delete process.env.ALLOWED_ORIGINS

  const req = createMockRequest({ action: 'ping' })
  const res = createMockResponse()

  try {
    await handler(req, res)
  } finally {
    if (oldGeminiKey == null) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = oldGeminiKey
    if (oldGoogleClientId == null) delete process.env.GOOGLE_CLIENT_ID
    else process.env.GOOGLE_CLIENT_ID = oldGoogleClientId
    if (oldAllowedOrigins == null) delete process.env.ALLOWED_ORIGINS
    else process.env.ALLOWED_ORIGINS = oldAllowedOrigins
  }

  assert.equal(res.statusCode, 200)
  assert.equal(JSON.parse(res.body).ok, true)
})

test('handler treats missing previousKeywords as an empty list', async () => {
  const oldGeminiKey = process.env.GEMINI_API_KEY
  const oldGoogleClientId = process.env.GOOGLE_CLIENT_ID
  const oldApiAuthToken = process.env.API_AUTH_TOKEN
  const oldFetch = globalThis.fetch
  process.env.GEMINI_API_KEY = 'test-key'
  delete process.env.GOOGLE_CLIENT_ID
  delete process.env.API_AUTH_TOKEN
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"keywords":["깔끔한 포장","빠른 배송","좋은 색감"]}' }] } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  const req = createMockRequest({
    action: 'keywords',
    images: [{ imageBase64: png1x1Base64, mimeType: 'image/png' }],
    rating: 5,
    category: 'product',
  })
  const res = createMockResponse()

  try {
    await handler(req, res)
  } finally {
    globalThis.fetch = oldFetch
    if (oldGeminiKey == null) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = oldGeminiKey
    if (oldGoogleClientId == null) delete process.env.GOOGLE_CLIENT_ID
    else process.env.GOOGLE_CLIENT_ID = oldGoogleClientId
    if (oldApiAuthToken == null) delete process.env.API_AUTH_TOKEN
    else process.env.API_AUTH_TOKEN = oldApiAuthToken
  }

  assert.equal(res.statusCode, 200)
  assert.deepEqual(JSON.parse(res.body).keywords, ['깔끔한 포장', '빠른 배송', '좋은 색감'])
})

test('validateImageInput rejects unsupported mime types', () => {
  const result = validateImageInput(png1x1Base64, 'image/gif')

  assert.equal(result.ok, false)
  assert.equal(result.status, 415)
})

test('validateImageInput rejects malformed base64', () => {
  const result = validateImageInput('not-valid-base64!', 'image/png')

  assert.equal(result.ok, false)
  assert.equal(result.status, 400)
})

test('validateImageInput rejects mismatched mime and file signature', () => {
  const result = validateImageInput(png1x1Base64, 'image/jpeg')

  assert.equal(result.ok, false)
  assert.equal(result.status, 400)
})

test('validateImageInput rejects decoded images above the server limit', () => {
  const oversizedPng = Buffer.alloc(1536 * 1024 + 1)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(
    oversizedPng,
  )

  const result = validateImageInput(oversizedPng.toString('base64'), 'image/png')

  assert.equal(result.ok, false)
  assert.equal(result.status, 413)
})

test('validateImagesInput accepts one to three images', () => {
  const result = validateImagesInput([
    { imageBase64: png1x1Base64, mimeType: 'image/png' },
    { imageBase64: png1x1Base64, mimeType: 'image/png' },
    { imageBase64: png1x1Base64, mimeType: 'image/png' },
  ])

  assert.equal(result.ok, true)
  assert.equal(result.images.length, 3)
  assert.equal(result.images[0].mimeType, 'image/png')
})

test('validateImagesInput rejects empty and too many image arrays', () => {
  assert.equal(validateImagesInput([]).ok, false)

  const tooMany = validateImagesInput([
    { imageBase64: png1x1Base64, mimeType: 'image/png' },
    { imageBase64: png1x1Base64, mimeType: 'image/png' },
    { imageBase64: png1x1Base64, mimeType: 'image/png' },
    { imageBase64: png1x1Base64, mimeType: 'image/png' },
  ])
  assert.equal(tooMany.ok, false)
  assert.equal(tooMany.status, 400)
})

test('validateImagesInput keeps legacy single-image request compatibility', () => {
  const result = validateImagesInput(undefined, png1x1Base64, 'image/png')

  assert.equal(result.ok, true)
  assert.equal(result.images.length, 1)
})

test('buildImageParts maps validated images to Gemini inline data parts', () => {
  assert.deepEqual(
    buildImageParts([
      { imageBase64: 'abc', mimeType: 'image/jpeg' },
      { imageBase64: 'def', mimeType: 'image/png' },
    ]),
    [
      { inline_data: { mime_type: 'image/jpeg', data: 'abc' } },
      { inline_data: { mime_type: 'image/png', data: 'def' } },
    ],
  )
})

test('applyRateLimit blocks bursts after the request window limit', async () => {
  const id = `test-rate-${Date.now()}-${Math.random()}`

  for (let i = 0; i < 20; i += 1) {
    assert.equal((await applyRateLimit(id)).ok, true)
  }

  const blocked = await applyRateLimit(id)
  assert.equal(blocked.ok, false)
  assert.equal(Number.isInteger(blocked.retryAfterSec), true)
})

test('applyDailyUsageLimit allows only counted actions up to the daily limit', async () => {
  const id = `test-user-${Date.now()}-${Math.random()}`

  assert.equal((await applyDailyUsageLimit(id, 'ping')).ok, true)

  for (let i = 0; i < 20; i += 1) {
    assert.equal((await applyDailyUsageLimit(id, 'keywords')).ok, true)
  }

  const blocked = await applyDailyUsageLimit(id, 'review')
  assert.equal(blocked.ok, false)
  assert.equal(blocked.limit, 20)
  assert.equal(Number.isInteger(blocked.retryAfterSec), true)
})

test('sanitizeKeywordArray keeps short Hangul phrases and removes invalid values', () => {
  assert.deepEqual(
    sanitizeKeywordArray([
      '배송 빠름',
      '배송 빠름',
      '색감 좋음',
      'too long english only',
      '추천해요',
      '',
    ]),
    ['배송 빠름', '색감 좋음'],
  )
})

test('isSameKeywordSet matches keyword sets regardless of order and spacing', () => {
  assert.equal(
    isSameKeywordSet(['배송 빠름', '색감 좋음'], [' 색감  좋음 ', '배송 빠름']),
    true,
  )
  assert.equal(
    isSameKeywordSet(['배송 빠름', '색감 좋음'], ['마감 깔끔', '색감 좋음']),
    false,
  )
})

test('appendKeywordRetryGuidance includes rejected keyword sets', () => {
  const prompt = appendKeywordRetryGuidance('기본 프롬프트', [
    ['배송 빠름', '색감 좋음'],
    ['마감 깔끔', '포장 꼼꼼'],
  ])

  assert.match(prompt, /금지된 이전 키워드 조합/)
  assert.match(prompt, /배송 빠름, 색감 좋음/)
  assert.match(prompt, /마감 깔끔, 포장 꼼꼼/)
  assert.match(prompt, /완전히 같은 조합/)
})

test('parseKeywordsFromText reads JSON keyword responses', () => {
  assert.deepEqual(
    parseKeywordsFromText('{"keywords":["배송 빠름","색감 좋음","마감 깔끔"]}'),
    ['배송 빠름', '색감 좋음', '마감 깔끔'],
  )
})

test('parseKeywordsFromText recovers keywords from quoted text', () => {
  assert.deepEqual(
    parseKeywordsFromText('키워드는 "배송 빠름", "색감 좋음", "마감 깔끔" 입니다.'),
    ['배송 빠름', '색감 좋음', '마감 깔끔'],
  )
})

test('buildKeywordGenerationConfig reserves output for short JSON responses', () => {
  const config = buildKeywordGenerationConfig()

  assert.equal(config.responseMimeType, 'application/json')
  assert.equal(config.responseSchema.type, 'object')
  assert.equal(config.responseJsonSchema, undefined)
  assert.equal(config.thinkingConfig.thinkingBudget, 0)
  assert.ok(config.maxOutputTokens >= 1024)
})

test('buildReviewGenerationConfig prioritizes complete reviews over tight length caps', () => {
  const shortConfig = buildReviewGenerationConfig('short')
  const mediumConfig = buildReviewGenerationConfig('medium')
  const longConfig = buildReviewGenerationConfig('long')

  assert.equal(shortConfig.temperature, 0.6)
  assert.equal(shortConfig.thinkingConfig.thinkingBudget, 0)
  assert.ok(shortConfig.maxOutputTokens >= 1024)
  assert.ok(mediumConfig.maxOutputTokens > shortConfig.maxOutputTokens)
  assert.ok(longConfig.maxOutputTokens > mediumConfig.maxOutputTokens)
})

test('humanizeGeminiApiError preserves non-quota API messages', () => {
  assert.equal(humanizeGeminiApiError(400, 'bad request'), 'bad request')
})

test('humanizeGeminiApiError returns rate-limit guidance for quota errors', () => {
  const message = humanizeGeminiApiError(429, 'quota exceeded, retry in 3.2s')

  assert.match(message, /Gemini API/)
  assert.match(message, /ai\.google\.dev/)
})

test('normalizeReviewCategory accepts known categories and falls back safely', () => {
  assert.equal(normalizeReviewCategory('place'), 'place')
  assert.equal(normalizeReviewCategory('product'), 'product')
  assert.equal(normalizeReviewCategory('unknown'), 'place')
  assert.equal(normalizeReviewCategory(undefined), 'place')
})

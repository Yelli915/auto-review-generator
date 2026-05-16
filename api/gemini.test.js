import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import test from 'node:test'
import {
  applyDailyUsageLimit,
  humanizeGeminiApiError,
  parseKeywordsFromText,
  sanitizeKeywordArray,
  validateImageInput,
} from './gemini.js'

const png1x1Base64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='

test('validateImageInput accepts supported image content', () => {
  const result = validateImageInput(`\n${png1x1Base64}\n`, 'IMAGE/PNG')

  assert.equal(result.ok, true)
  assert.equal(result.mimeType, 'image/png')
  assert.equal(result.imageBase64, png1x1Base64)
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

test('applyDailyUsageLimit allows only counted actions up to the daily limit', () => {
  const id = `test-user-${Date.now()}-${Math.random()}`

  assert.equal(applyDailyUsageLimit(id, 'ping').ok, true)

  for (let i = 0; i < 20; i += 1) {
    assert.equal(applyDailyUsageLimit(id, 'keywords').ok, true)
  }

  const blocked = applyDailyUsageLimit(id, 'review')
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

test('humanizeGeminiApiError preserves non-quota API messages', () => {
  assert.equal(humanizeGeminiApiError(400, 'bad request'), 'bad request')
})

test('humanizeGeminiApiError returns rate-limit guidance for quota errors', () => {
  const message = humanizeGeminiApiError(429, 'quota exceeded, retry in 3.2s')

  assert.match(message, /Gemini API/)
  assert.match(message, /ai\.google\.dev/)
})

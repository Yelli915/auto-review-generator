/* global process */
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import test from 'node:test'
import { authorizeRequest } from './auth.js'
import { applyDailyUsageLimit, applyRateLimit } from './rateLimit.js'
import {
  buildImageParts,
  validateImageInput,
  validateImagesInput,
} from './imageInput.js'
import { createMockRequest, png1x1Base64, withEnv } from '../testUtils.js'

delete process.env.UPSTASH_REDIS_REST_URL
delete process.env.UPSTASH_REDIS_REST_TOKEN

// auth.js
test('authorizeRequest normalizes configured production origins', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      GOOGLE_CLIENT_ID: null,
      API_AUTH_TOKEN: 'test-token',
      ALLOWED_ORIGINS: 'https://example.vercel.app/',
    },
    async () => {
      const req = createMockRequest(
        { action: 'keywords' },
        {
          origin: 'https://example.vercel.app',
          'x-api-auth-token': 'test-token',
        },
      )

      const result = await authorizeRequest(req)

      assert.equal(result.ok, true)
    },
  )
})

test('authorizeRequest rejects unlisted production origins', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      GOOGLE_CLIENT_ID: null,
      API_AUTH_TOKEN: 'test-token',
      ALLOWED_ORIGINS: 'https://example.vercel.app',
    },
    async () => {
      const req = createMockRequest(
        { action: 'keywords' },
        {
          origin: 'https://preview.example.vercel.app',
          'x-api-auth-token': 'test-token',
        },
      )

      const result = await authorizeRequest(req)

      assert.equal(result.ok, false)
      assert.equal(result.status, 403)
      assert.equal(result.error, 'Origin is not allowed.')
    },
  )
})

// rateLimit.js
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

// imageInput.js
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

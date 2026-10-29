/* global process */
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import test from 'node:test'
import { authorizeRequest } from './auth.js'
import {
  applyDailyUsageLimit,
  applyRateLimit,
  getLocalDayKey,
  secondsUntilNextLocalDay,
} from './rateLimit.js'
import {
  buildImageParts,
  validateImageInput,
  validateImagesInput,
} from './review/imageInput.js'
import {
  createMockRequest,
  jsonResponse,
  png1x1Base64,
  withEnv,
  withFetch,
} from './testUtils.js'

delete process.env.UPSTASH_REDIS_REST_URL
delete process.env.UPSTASH_REDIS_REST_TOKEN

// auth.js
test('authorizeRequest resolves each origin configuration to the expected status', async () => {
  const origin = 'https://example.vercel.app'
  const cases = [
    // [설명, 환경, 요청 헤더, 기대 상태(null이면 통과)]
    ['dev passes without origin config', {}, {}, null],
    ['production listed origin passes', { NODE_ENV: 'production', ALLOWED_ORIGINS: origin }, { origin }, null],
    ['production normalizes configured origins', { NODE_ENV: 'production', ALLOWED_ORIGINS: `${origin}/` }, { origin }, null],
    ['production unlisted origin', { NODE_ENV: 'production', ALLOWED_ORIGINS: origin }, { origin: 'https://preview.example.vercel.app' }, 403],
    ['production missing origin header', { NODE_ENV: 'production', ALLOWED_ORIGINS: origin }, {}, 403],
    ['production without allowed origins', { NODE_ENV: 'production' }, { origin }, 500],
  ]
  for (const [name, env, headers, status] of cases) {
    await withEnv(
      { NODE_ENV: 'test', ALLOWED_ORIGINS: null, ...env },
      async () => {
        const result = authorizeRequest(createMockRequest({}, headers))
        assert.equal(result.ok, status === null, name)
        if (status !== null) assert.equal(result.status, status, name)
      },
    )
  }
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

  assert.equal((await applyDailyUsageLimit(id, 'uncounted-action')).ok, true)

  for (let i = 0; i < 20; i += 1) {
    assert.equal((await applyDailyUsageLimit(id, 'keywords')).ok, true)
  }
  assert.equal((await applyDailyUsageLimit(`${id}-count`, 'keywords')).count, 1)

  const blocked = await applyDailyUsageLimit(id, 'keywords')
  assert.equal(blocked.ok, false)
  assert.equal(blocked.limit, 20)
  assert.equal(Number.isInteger(blocked.retryAfterSec), true)
  assert.equal(Number.isInteger((await applyDailyUsageLimit(`${id}-reset`, 'review')).resetAfterSec), true)

  // action마다 따로 세므로 다른 action은 계속 허용됩니다.
  assert.equal((await applyDailyUsageLimit(id, 'review')).ok, true)
  for (let i = 0; i < 60; i += 1) {
    assert.equal((await applyDailyUsageLimit(id, 'analyze-product')).ok, true)
  }
  assert.equal((await applyDailyUsageLimit(id, 'analyze-product')).limit, 60)
})

test('applyDailyUsageLimit refund gives back one charged use', async () => {
  const id = `test-refund-${Date.now()}-${Math.random()}`

  const first = await applyDailyUsageLimit(id, 'review')
  await applyDailyUsageLimit(id, 'review')
  assert.equal(await first.refund(), 1)
  assert.equal((await applyDailyUsageLimit(id, 'review')).count, 2)
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

test('daily usage resets at KST midnight regardless of server time zone', () => {
  // 2026-01-01 14:59:59Z = KST 23:59:59, 15:00:00Z = 다음 날 KST 00:00:00
  assert.equal(getLocalDayKey(new Date('2026-01-01T14:59:59Z')), '2026-01-01')
  assert.equal(getLocalDayKey(new Date('2026-01-01T15:00:00Z')), '2026-01-02')
  assert.equal(secondsUntilNextLocalDay(new Date('2026-01-01T14:59:59Z')), 1)
  assert.equal(secondsUntilNextLocalDay(new Date('2026-01-01T15:00:00Z')), 86400)
})

test('shared rate limit weighs the previous window so bursts cannot double at the boundary', async (t) => {
  // 창이 막 바뀐 직후(경과 10%): 직전 창 20회 × 0.9 + 이번 창 3회 = 21 > 20
  t.mock.method(Date, 'now', () => 60_000 * 1000 + 6_000)
  const redis = (current, previous) => async () =>
    jsonResponse([{ result: current }, { result: 1 }, { result: previous }])

  await withEnv(
    { UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 'token' },
    async () => {
      const blocked = await withFetch(redis(3, '20'), () => applyRateLimit('burst'))
      assert.deepEqual(blocked, { ok: false, retryAfterSec: 54 })
      assert.equal((await withFetch(redis(2, '20'), () => applyRateLimit('burst'))).ok, true)
      assert.equal((await withFetch(redis(1, null), () => applyRateLimit('fresh'))).ok, true)
    },
  )
})

test('shared stores undo rejected rate hits and re-expire refunded daily keys', async (t) => {
  t.mock.method(Date, 'now', () => 60_000 * 1000 + 6_000)
  const commands = []
  const redis = (results) => async (_url, init) => {
    commands.push(JSON.parse(init.body))
    return jsonResponse(results)
  }

  await withEnv(
    { UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 'token' },
    async () => {
      await withFetch(redis([{ result: 3 }, { result: 1 }, { result: '20' }]), () => applyRateLimit('burst'))
      assert.equal(commands.at(-1)[0][0], 'DECR')

      const usage = await withFetch(redis([{ result: 1 }, { result: 1 }]), () =>
        applyDailyUsageLimit('refund-user', 'review'),
      )
      // 키가 만료된 뒤 환불하면 DECR이 -1을 돌려줍니다.
      assert.equal(await withFetch(redis([{ result: -1 }, { result: 1 }]), () => usage.refund()), 0)
      assert.deepEqual(commands.at(-1).map(([command]) => command), ['DECR', 'EXPIRE'])
    },
  )
})

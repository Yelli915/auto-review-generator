/* global process */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyDailyUsageLimit,
  applyRateLimit,
} from '../gemini.js'

delete process.env.UPSTASH_REDIS_REST_URL
delete process.env.UPSTASH_REDIS_REST_TOKEN

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

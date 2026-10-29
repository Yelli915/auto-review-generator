import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildKeywordGenerationConfig,
  buildReviewGenerationConfig,
  humanizeGeminiApiError,
  parseGeminiSseLine,
  requestGemini,
} from './geminiClient.js'
import { withFetchCalls } from '../testUtils.js'

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

test('humanizeGeminiApiError returns retry guidance for transient upstream failures', () => {
  const message = humanizeGeminiApiError(500, 'internal server error')

  assert.match(message, /Gemini API/)
  assert.doesNotMatch(message, /HTTP 500/)
})

test('requestGemini stops retrying once the deadline signal aborts', async () => {
  await withFetchCalls(
    async (_url, options) => {
      options.signal.throwIfAborted()
      throw new Error('unreachable')
    },
    async (calls) => {
      const result = await requestGemini({
        key: 'test-key',
        payload: {},
        signal: AbortSignal.abort(),
      })

      assert.equal(result.ok, false)
      assert.match(result.error, /시간이 초과/)
      assert.equal(calls.length, 1)
    },
  )
})

test('parseGeminiSseLine reads text and finishReason, skips invalid lines', () => {
  const line = `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: '안녕' }] }, finishReason: 'STOP' }] })}`

  assert.deepEqual(parseGeminiSseLine(line), { text: '안녕', finishReason: 'STOP' })
  assert.equal(parseGeminiSseLine('data: {broken'), null)
  assert.equal(parseGeminiSseLine('data: [DONE]'), null)
  assert.equal(parseGeminiSseLine(': keep-alive'), null)
})

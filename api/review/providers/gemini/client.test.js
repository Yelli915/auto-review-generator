import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildKeywordGenerationConfig,
  buildReviewGenerationConfig,
  humanizeGeminiApiError,
} from './client.js'

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

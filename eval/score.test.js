import assert from 'node:assert/strict'
import test from 'node:test'
import { scoreReview, summarize } from './score.js'

test('scoreReview reports hallucination, missing keywords and length', () => {
  const testCase = {
    category: 'product',
    keywords: ['저소음 키감', '배터리 오래감'],
    forbidden: ['배송'],
  }
  const score = scoreReview({
    review: '배송이 빨랐고 키감이 조용해요.',
    finishReason: 'STOP',
    minReviewChars: 40,
    testCase,
  })

  assert.equal(score.hallucinated, true)
  assert.deepEqual(score.forbiddenHits, ['배송'])
  assert.deepEqual(score.missingKeywords, ['배터리 오래감'])
  assert.equal(score.keywordCoverage, 0.5)
  assert.equal(score.tooShort, true)
  assert.equal(score.truncated, false)
})

test('summarize computes rates and medians', () => {
  const ok = { hallucinated: false, keywordCoverage: 1, tooShort: false, truncated: false, genericHits: [] }
  const bad = { ...ok, hallucinated: true, keywordCoverage: 0.5, genericHits: ['만족'] }
  const summary = summarize(
    [
      { score: ok, ttftMs: 300, totalMs: 1000 },
      { score: bad, ttftMs: 500, totalMs: 3000 },
    ],
    1,
  )

  assert.equal(summary.hallucinationRate, 0.5)
  assert.equal(summary.keywordCoverage, 0.75)
  assert.equal(summary.genericPhraseRate, 0.5)
  assert.equal(summary.medianTtftMs, 400)
  assert.equal(summary.failed, 1)
})

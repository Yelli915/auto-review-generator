import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildKeywordPrompt,
  buildReviewPrompt,
  keywordSentimentGuide,
} from './prompts.js'

test('keywordSentimentGuide maps ratings to sentiment instructions', () => {
  assert.match(keywordSentimentGuide(1), /사실 기반/)
  assert.match(keywordSentimentGuide(3), /중립/)
  assert.match(keywordSentimentGuide(5), /광고처럼 과장하지/)
})

test('buildKeywordPrompt includes review category and multi-image context', () => {
  const prompt = buildKeywordPrompt({
    rating: 4,
    category: 'place',
    imageCount: 3,
    minKeywordCount: 3,
    maxKeywordCount: 8,
  })

  assert.match(prompt, /장소 리뷰/)
  assert.match(prompt, /공간/)
  assert.match(prompt, /확인되지 않는/)
  assert.match(prompt, /3장의 이미지/)
  assert.match(prompt, /직접 확인 가능한 단서/)
  assert.match(prompt, /4점/)
  assert.match(prompt, /3~8개/)
})

test('buildReviewPrompt includes review category context', () => {
  const { prompt, safeLength, minReviewChars } = buildReviewPrompt({
    rating: 5,
    keywords: ['응대 친절', '속도 빠름'],
    length: 'long',
    tone: 'formal',
    category: 'place',
  })

  assert.equal(safeLength, 'long')
  assert.equal(minReviewChars, 90)
  assert.match(prompt, /대상: 장소/)
  assert.match(prompt, /응대/)
  assert.match(prompt, /담당자 실명/)
  assert.match(prompt, /키워드를 그대로 나열하지/)
  assert.match(prompt, /구체 정보는 새로 만들지/)
  assert.match(prompt, /90자 이상/)
  assert.match(prompt, /격식/)
})

test('buildReviewPrompt guides sparse long reviews without blocking them', () => {
  const { prompt, safeLength, minReviewChars } = buildReviewPrompt({
    rating: 4,
    keywords: ['색감 좋음'],
    length: 'long',
    tone: 'neutral',
    category: 'product',
  })

  assert.equal(safeLength, 'long')
  assert.equal(minReviewChars, 90)
  assert.match(prompt, /키워드가 적으므로/)
  assert.match(prompt, /반복해 분량을 늘리지 말고/)
  assert.match(prompt, /확인 가능한 단서/)
})

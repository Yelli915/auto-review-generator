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
    category: 'accommodation',
    imageCount: 3,
    minKeywordCount: 3,
    maxKeywordCount: 8,
  })

  assert.match(prompt, /숙소 리뷰/)
  assert.match(prompt, /청결/)
  assert.match(prompt, /단정하지/)
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
    category: 'service',
  })

  assert.equal(safeLength, 'long')
  assert.equal(minReviewChars, 160)
  assert.match(prompt, /분야: 서비스/)
  assert.match(prompt, /응대/)
  assert.match(prompt, /정확한 처리 시간/)
  assert.match(prompt, /키워드를 그대로 나열하지/)
  assert.match(prompt, /구체 정보는 새로 만들지/)
  assert.match(prompt, /격식/)
})

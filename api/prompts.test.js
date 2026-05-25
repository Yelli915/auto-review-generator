import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildKeywordPrompt,
  buildReviewPrompt,
  keywordSentimentGuide,
} from './prompts.js'

test('keywordSentimentGuide maps ratings to sentiment instructions', () => {
  assert.match(keywordSentimentGuide(1), /문제 지점/)
  assert.match(keywordSentimentGuide(3), /장단점/)
  assert.match(keywordSentimentGuide(5), /카테고리 공용 문구/)
})

test('buildKeywordPrompt includes review category and multi-image context', () => {
  const prompt = buildKeywordPrompt({
    rating: 4,
    category: 'place',
    imageCount: 3,
    minKeywordCount: 3,
    maxKeywordCount: 8,
  })

  assert.match(prompt, /장소 리뷰용 키워드/)
  assert.match(prompt, /실제 관찰 포인트/)
  assert.match(prompt, /공통 카테고리 문구/)
  assert.match(prompt, /사진 3장을 함께/)
  assert.match(prompt, /최소 3개, 최대 8개/)
})

test('buildKeywordPrompt asks for variation from previous keywords', () => {
  const prompt = buildKeywordPrompt({
    rating: 5,
    category: 'product',
    imageCount: 1,
    minKeywordCount: 3,
    maxKeywordCount: 8,
    previousKeywords: ['배송 좋음', '포장 깔끔', '마감 훌륭'],
  })

  assert.match(prompt, /직전 조합/)
  assert.match(prompt, /최소 1개 이상은 완전히 다른 관찰 포인트/)
})

test('buildReviewPrompt includes review category context', () => {
  const { prompt, safeLength, minReviewChars } = buildReviewPrompt({
    rating: 5,
    keywords: ['조명 편함', '동선 넓음'],
    length: 'long',
    tone: 'formal',
    category: 'place',
  })

  assert.equal(safeLength, 'long')
  assert.equal(minReviewChars, 90)
  assert.match(prompt, /대상: 장소/)
  assert.match(prompt, /실제 대상의 특징만/)
  assert.match(prompt, /위치, 동선, 좌석/)
  assert.match(prompt, /다른 상품이나 장소에도 그대로 쓸 수 있는 말/)
  assert.match(prompt, /90자 이상/)
  assert.match(prompt, /실제 경험한 디테일/)
})

test('buildReviewPrompt guides sparse long reviews without blocking them', () => {
  const { prompt, safeLength, minReviewChars } = buildReviewPrompt({
    rating: 4,
    keywords: ['배송 좋음'],
    length: 'long',
    tone: 'neutral',
    category: 'product',
  })

  assert.equal(safeLength, 'long')
  assert.equal(minReviewChars, 90)
  assert.match(prompt, /선택한 키워드가 적어서 길게 쓰면 흔한 말로 흐를 수 있으니/)
  assert.match(prompt, /카테고리 공통문장/)
  assert.match(prompt, /실제 대상에서 확인된 구체 요소/)
})

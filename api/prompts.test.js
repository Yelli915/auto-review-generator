import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildKeywordPrompt,
  buildReviewPrompt,
  keywordSentimentGuide,
} from './prompts.js'

test('keywordSentimentGuide maps ratings to sentiment instructions', () => {
  assert.ok(keywordSentimentGuide(1).length > 10)
  assert.ok(keywordSentimentGuide(3).length > 10)
  assert.ok(keywordSentimentGuide(5).length > 10)
})

test('buildKeywordPrompt includes review category and multi-image context', () => {
  const prompt = buildKeywordPrompt({
    rating: 4,
    category: 'place',
    imageCount: 3,
    minKeywordCount: 3,
    maxKeywordCount: 8,
  })

  assert.match(prompt, /장소/)
  assert.match(prompt, /3/)
  assert.match(prompt, /8/)
  assert.match(prompt, /JSON/)
  assert.match(prompt, /keywords/)
})

test('buildKeywordPrompt includes product context from URL analysis', () => {
  const prompt = buildKeywordPrompt({
    rating: 5,
    category: 'product',
    productContext:
      '사이트: shop.example\n상품명: 무선 키보드\n설명: 조용한 타건감\n선택 옵션:\n색상: 블랙',
    minKeywordCount: 3,
    maxKeywordCount: 8,
  })

  assert.match(prompt, /shop\.example/)
  assert.match(prompt, /상품명: 무선 키보드/)
  assert.match(prompt, /선택 옵션/)
  assert.match(prompt, /색상: 블랙/)
  assert.match(prompt, /JSON/)
})

test('buildKeywordPrompt asks for variation from previous keywords', () => {
  const prompt = buildKeywordPrompt({
    rating: 5,
    category: 'product',
    imageCount: 1,
    minKeywordCount: 3,
    maxKeywordCount: 8,
    previousKeywords: ['배송 빠름', '포장 깔끔', '마감 탄탄'],
  })

  assert.match(prompt, /배송 빠름/)
  assert.match(prompt, /포장 깔끔/)
  assert.match(prompt, /마감 탄탄/)
})


test('buildKeywordPrompt guides food appearance and taste for place reviews', () => {
  const prompt = buildKeywordPrompt({
    rating: 5,
    category: 'place',
    imageCount: 1,
    minKeywordCount: 3,
    maxKeywordCount: 8,
  })

  assert.match(prompt, /음식의 모양과 맛 평가/)
  assert.match(prompt, /플레이팅/)
  assert.match(prompt, /추측하지 마/)
})

test('buildReviewPrompt includes review category context', () => {
  const { prompt, safeLength, minReviewChars } = buildReviewPrompt({
    rating: 5,
    keywords: ['조명 은은함', '동선 편함'],
    length: 'long',
    tone: 'formal',
    category: 'place',
  })

  assert.equal(safeLength, 'long')
  assert.equal(minReviewChars, 90)
  assert.match(prompt, /장소/)
  assert.match(prompt, /조명 은은함/)
  assert.match(prompt, /동선 편함/)
  assert.match(prompt, /90/)
})

test('buildReviewPrompt guides food appearance and taste for place reviews', () => {
  const { prompt } = buildReviewPrompt({
    rating: 5,
    keywords: ['플레이팅 색감', '간이 잘 맞음'],
    length: 'medium',
    tone: 'friendly',
    category: 'place',
  })

  assert.match(prompt, /음식의 모양과 맛 평가/)
  assert.match(prompt, /식감/)
  assert.match(prompt, /간/)
})

test('buildReviewPrompt guides sparse long reviews without blocking them', () => {
  const { prompt, safeLength, minReviewChars } = buildReviewPrompt({
    rating: 4,
    keywords: ['배송 빠름'],
    length: 'long',
    tone: 'neutral',
    category: 'product',
  })

  assert.equal(safeLength, 'long')
  assert.equal(minReviewChars, 90)
  assert.match(prompt, /상품/)
  assert.match(prompt, /배송 빠름/)
  assert.match(prompt, /90/)
})

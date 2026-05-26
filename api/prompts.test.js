import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildKeywordPrompt,
  buildProductTypePrompt,
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
  assert.match(prompt, /이 장소 자체에서만 확인되는 구체 특성/)
  assert.match(prompt, /최소 3개, 최대 8개/)
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

  assert.match(prompt, /상품\/장소에서 수집한 실제 정보/)
  assert.match(prompt, /상품명: 무선 키보드/)
  assert.match(prompt, /선택 옵션/)
  assert.match(prompt, /상품명, 설명, 선택 옵션/)
  assert.match(prompt, /추측은 배제/)
  assert.match(prompt, /이 상품 자체에서만 확인되는 구체 특성/)
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

  assert.match(prompt, /직전 조합/)
  assert.match(prompt, /최소 1개 이상은 이전과 다른 관찰 포인트/)
})

test('buildProductTypePrompt asks for focused product type candidates', () => {
  const prompt = buildProductTypePrompt({
    category: 'product',
    productContext: '상품명: 데일리 러닝화\n설명: 쿠션감 좋은 운동화',
    minTypeCount: 3,
    maxTypeCount: 6,
  })

  assert.match(prompt, /상품 유형 후보/)
  assert.match(prompt, /브랜드명, 모델명, 색상, 용량/)
  assert.match(prompt, /productTypes/)
  assert.match(prompt, /3~6/)
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
  assert.match(prompt, /대상: 장소/)
  assert.match(prompt, /실제 대상의 특징/)
  assert.match(prompt, /위치, 동선, 좌석/)
  assert.match(prompt, /다른 상품이나 장소에도 그대로 쓸 수 있는 말/)
  assert.match(prompt, /90자 이상/)
  assert.match(prompt, /실제 경험의 디테일/)
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
  assert.match(prompt, /선택한 키워드가 적어도 길게 쓸 때/)
  assert.match(prompt, /카테고리 공통 문장/)
  assert.match(prompt, /실제 대상에서 확인한 구체 요소/)
})

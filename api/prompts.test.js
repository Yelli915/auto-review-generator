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

test('buildReviewPrompt asks for subjective experience-based writing', () => {
  const { prompt } = buildReviewPrompt({
    rating: 4,
    keywords: ['마감 탄탄함', '사용감 편함'],
    length: 'medium',
    tone: 'friendly',
    category: 'product',
  })

  assert.match(prompt, /주관적 후기/)
  assert.match(prompt, /체감 중심/)
  assert.match(prompt, /좋았던 점과 아쉬웠던 점/)
})

test('buildReviewPrompt prioritizes product contents over packaging containers', () => {
  const { prompt } = buildReviewPrompt({
    rating: 5,
    keywords: ['내용물 색감 선명함', '용기 밀봉 깔끔함'],
    length: 'medium',
    tone: 'friendly',
    category: 'product',
  })

  assert.match(prompt, /포장 용기나 케이스 설명을 최대한 후순위/)
  assert.match(prompt, /실제 내용물의 모양, 색, 질감, 양, 향, 상태, 사용감/)
  assert.match(prompt, /짧게 뒤쪽에 언급/)
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

test('buildReviewPrompt guides cosmetics with matching review criteria', () => {
  const { prompt } = buildReviewPrompt({
    rating: 5,
    keywords: ['은은한 향', '부드러운 발림성', '오래가는 지속력'],
    length: 'medium',
    tone: 'friendly',
    category: 'product',
  })

  assert.match(prompt, /화장품/)
  assert.match(prompt, /향/)
  assert.match(prompt, /발림성/)
  assert.match(prompt, /지속력/)
  assert.match(prompt, /피부 타입/)
})

test('buildReviewPrompt omits cosmetics guide for unrelated product reviews', () => {
  const { prompt } = buildReviewPrompt({
    rating: 4,
    keywords: ['마감 탄탄함', '각도 조절 편함'],
    length: 'medium',
    tone: 'friendly',
    category: 'product',
  })

  assert.doesNotMatch(prompt, /화장품/)
  assert.doesNotMatch(prompt, /발림성/)
  assert.doesNotMatch(prompt, /피부 타입/)
})

test('buildKeywordPrompt guides cosmetics keyword criteria for product reviews', () => {
  const prompt = buildKeywordPrompt({
    rating: 5,
    category: 'product',
    productContext:
      '상품명: 수분 크림\n설명: 건조한 피부를 위한 데일리 보습 크림\n선택 옵션:\n용량: 50ml',
    minKeywordCount: 3,
    maxKeywordCount: 8,
  })

  assert.match(prompt, /화장품/)
  assert.match(prompt, /향/)
  assert.match(prompt, /발림성/)
  assert.match(prompt, /보습감/)
})

test('buildKeywordPrompt prioritizes cosmetic contents over containers', () => {
  const prompt = buildKeywordPrompt({
    rating: 5,
    category: 'product',
    imageCount: 1,
    minKeywordCount: 3,
    maxKeywordCount: 8,
  })

  assert.match(prompt, /화장품이나 뷰티 제품의 키워드/)
  assert.match(prompt, /용기 표현을 키워드의 중심으로 쓰지 말고/)
  assert.match(prompt, /내용물의 제형, 색감, 광택, 농도, 향/)
  assert.match(prompt, /누수, 파손, 펌프 불량, 위생, 휴대성/)
})

test('buildKeywordPrompt omits cosmetic review criteria for unrelated product context', () => {
  const prompt = buildKeywordPrompt({
    rating: 5,
    category: 'product',
    productContext:
      '상품명: 무선 키보드\n설명: 조용한 타건감의 사무용 키보드\n선택 옵션:\n색상: 블랙',
    minKeywordCount: 3,
    maxKeywordCount: 8,
  })

  assert.doesNotMatch(prompt, /피부 타입/)
  assert.doesNotMatch(prompt, /성분 효과/)
})

test('buildKeywordPrompt prioritizes product contents over packaging containers', () => {
  const prompt = buildKeywordPrompt({
    rating: 5,
    category: 'product',
    imageCount: 1,
    minKeywordCount: 3,
    maxKeywordCount: 8,
  })

  assert.match(prompt, /실제 내용물의 모양, 색, 질감, 양, 향, 상태, 사용감/)
  assert.match(prompt, /포장 용기나 케이스 설명을 최대한 후순위/)
  assert.match(prompt, /리뷰 판단에 직접 영향을 주는 경우/)
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

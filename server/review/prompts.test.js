import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  buildKeywordPrompt,
  buildReviewPrompt,
  keywordSentimentGuide,
} from './prompts.js'

test('prompt source keeps readable Korean text', () => {
  const source = readFileSync(new URL('./prompts.js', import.meta.url), 'utf8')

  assert.equal(source.includes('리뷰'), true)
  assert.equal(source.includes('상품'), true)
  assert.equal(source.includes('장소'), true)
  assert.equal(source.includes('�'), false)
})

test('keywordSentimentGuide maps ratings to distinct sentiment instructions', () => {
  assert.match(keywordSentimentGuide(1), /매우 불만족/)
  assert.match(keywordSentimentGuide(3), /보통/)
  assert.match(keywordSentimentGuide(5), /매우 만족/)
})

test('buildKeywordPrompt is structured around role, evidence, rules, bans, and JSON output', () => {
  const prompt = buildKeywordPrompt({
    rating: 4,
    category: 'place',
    imageCount: 3,
    minKeywordCount: 3,
    maxKeywordCount: 8,
  })

  assert.match(prompt, /역할: 장소 리뷰/)
  assert.match(prompt, /사진 3장/)
  assert.match(prompt, /품질 기준:/)
  assert.match(prompt, /금지사항:/)
  assert.match(prompt, /출력 형식:/)
  assert.match(prompt, /JSON만 출력/)
  assert.match(prompt, /"keywords"/)
})

test('buildKeywordPrompt includes product context and option evidence from URL analysis', () => {
  const prompt = buildKeywordPrompt({
    rating: 5,
    category: 'product',
    productContext:
      '확인된 상품 정보:\n상품명: 무선 키보드\n설명: 조용한 저소음 키보드\n선택 옵션:\n색상: 블랙',
    minKeywordCount: 3,
    maxKeywordCount: 8,
  })

  assert.match(prompt, /입력 근거:/)
  assert.match(prompt, /무선 키보드/)
  assert.match(prompt, /색상: 블랙/)
  assert.match(prompt, /위 입력 근거/)
})

test('buildKeywordPrompt includes subcategory guidance', () => {
  const prompt = buildKeywordPrompt({
    rating: 5,
    category: 'place',
    subcategory: 'cafe',
    imageCount: 1,
    minKeywordCount: 3,
    maxKeywordCount: 8,
  })

  assert.match(prompt, /세부 분야는 "카페"/)
  assert.match(prompt, /음료와 디저트/)
})

test('buildKeywordPrompt constrains user experience evidence', () => {
  const prompt = buildKeywordPrompt({
    rating: 4,
    category: 'product',
    productContext:
      '사진/상품 정보에서 확인한 근거:\n상품명: 무선 키보드\n\n사용자가 직접 경험한 내용:\n키감은 좋았지만 무게가 조금 아쉬웠습니다.',
    minKeywordCount: 3,
    maxKeywordCount: 8,
  })

  assert.match(prompt, /사용자가 직접 경험한 내용/)
  assert.match(prompt, /경험 표현은 "사용자가 직접 경험한 내용"/)
})

test('buildKeywordPrompt separates observed evidence and user experience', () => {
  const prompt = buildKeywordPrompt({
    rating: 4,
    category: 'product',
    productContext:
      'observedEvidence:\n상품명: 무선 키보드\n옵션: 블랙\n\nuserExperience:\n키감은 좋았지만 무게가 조금 아쉬웠습니다.',
    minKeywordCount: 3,
    maxKeywordCount: 8,
  })

  assert.match(prompt, /observedEvidence/)
  assert.match(prompt, /userExperience/)
  assert.match(prompt, /객관 정보와 사진에서 보이는 정보/)
  assert.match(prompt, /직접 겪은 장점, 아쉬운 점/)
  assert.match(prompt, /selectedKeywords/)
})

test('buildKeywordPrompt asks for variation from previous keywords', () => {
  const prompt = buildKeywordPrompt({
    rating: 5,
    category: 'product',
    imageCount: 1,
    minKeywordCount: 3,
    maxKeywordCount: 8,
    previousKeywords: ['배송 빠름', '포장 깔끔', '마감 안정감'],
  })

  assert.match(prompt, /배송 빠름/)
  assert.match(prompt, /포장 깔끔/)
  assert.match(prompt, /최소 1개 이상은 다른 관찰 포인트/)
})

test('buildKeywordPrompt gates cosmetics guidance to matching product context', () => {
  const cosmeticPrompt = buildKeywordPrompt({
    rating: 5,
    category: 'product',
    productContext: '상품명: 수분 크림\n설명: 건조한 피부를 위한 데일리 보습 크림',
    minKeywordCount: 3,
    maxKeywordCount: 8,
  })
  const keyboardPrompt = buildKeywordPrompt({
    rating: 5,
    category: 'product',
    productContext: '상품명: 무선 키보드\n설명: 조용한 저소음 키보드',
    minKeywordCount: 3,
    maxKeywordCount: 8,
  })

  assert.match(cosmeticPrompt, /화장품\/뷰티 상품으로 확인되는 경우/)
  assert.match(cosmeticPrompt, /발림성/)
  assert.doesNotMatch(keyboardPrompt, /발림성/)
  assert.doesNotMatch(keyboardPrompt, /보습/)
})

test('buildKeywordPrompt keeps product content priority over packaging', () => {
  const prompt = buildKeywordPrompt({
    rating: 5,
    category: 'product',
    imageCount: 1,
    minKeywordCount: 3,
    maxKeywordCount: 8,
  })

  assert.match(prompt, /포장, 용기, 케이스 설명보다 실제 내용물/)
  assert.match(prompt, /사용 판단에 직접 영향/)
})

test('buildKeywordPrompt guides food appearance and taste only for place reviews', () => {
  const placePrompt = buildKeywordPrompt({
    rating: 5,
    category: 'place',
    imageCount: 1,
    minKeywordCount: 3,
    maxKeywordCount: 8,
  })
  const productPrompt = buildKeywordPrompt({
    rating: 5,
    category: 'product',
    imageCount: 1,
    minKeywordCount: 3,
    maxKeywordCount: 8,
  })

  assert.match(placePrompt, /플레이팅/)
  assert.match(placePrompt, /확인되지 않는 메뉴명/)
  assert.doesNotMatch(productPrompt, /플레이팅/)
})

test('buildReviewPrompt includes review category, keywords, tone, length, and min chars', () => {
  const { prompt, safeLength, minReviewChars } = buildReviewPrompt({
    rating: 5,
    keywords: ['조명 은은함', '동선 편함'],
    length: 'long',
    tone: 'formal',
    category: 'place',
  })

  assert.equal(safeLength, 'long')
  assert.equal(minReviewChars, 90)
  assert.match(prompt, /역할: 장소 리뷰/)
  assert.match(prompt, /조명 은은함, 동선 편함/)
  assert.match(prompt, /정중하고 담백하게/)
  assert.match(prompt, /최소 90자 이상/)
})

test('buildReviewPrompt includes subcategory guidance', () => {
  const { prompt } = buildReviewPrompt({
    rating: 4,
    keywords: ['핏 안정감', '소재 부드러움'],
    length: 'medium',
    tone: 'neutral',
    category: 'product',
    subcategory: 'fashion',
  })

  assert.match(prompt, /세부 분야는 "패션"/)
  assert.match(prompt, /핏, 소재감/)
})

test('buildReviewPrompt passes product context into the final review prompt', () => {
  const { prompt } = buildReviewPrompt({
    rating: 4,
    keywords: ['블랙 색상', '저소음 타건감'],
    length: 'medium',
    tone: 'friendly',
    category: 'product',
    productContext:
      '확인된 상품 정보:\n상품명: 무선 키보드\n설명: 조용한 저소음 키보드\n선택 옵션:\n색상: 블랙',
  })

  assert.match(prompt, /입력 근거:/)
  assert.match(prompt, /상품명: 무선 키보드/)
  assert.match(prompt, /색상: 블랙/)
  assert.match(prompt, /블랙 색상, 저소음 타건감/)
})

test('buildReviewPrompt constrains user experience evidence', () => {
  const { prompt } = buildReviewPrompt({
    rating: 4,
    keywords: ['키감 좋음', '무게 아쉬움'],
    length: 'medium',
    tone: 'neutral',
    category: 'product',
    productContext:
      '사진/상품 정보에서 확인한 근거:\n상품명: 무선 키보드\n\n사용자가 직접 경험한 내용:\n키감은 좋았지만 무게가 조금 아쉬웠습니다.',
  })

  assert.match(prompt, /사용자가 직접 경험한 내용/)
  assert.match(prompt, /경험 표현은 "사용자가 직접 경험한 내용"/)
})

test('buildReviewPrompt separates observed evidence, user experience, and selected keywords', () => {
  const { prompt } = buildReviewPrompt({
    rating: 4,
    keywords: ['키감 좋음', '무게 아쉬움'],
    length: 'medium',
    tone: 'neutral',
    category: 'product',
    productContext:
      'observedEvidence:\n상품명: 무선 키보드\n옵션: 블랙\n\nuserExperience:\n키감은 좋았지만 무게가 조금 아쉬웠습니다.',
  })

  assert.match(prompt, /observedEvidence/)
  assert.match(prompt, /userExperience/)
  assert.match(prompt, /selectedKeywords/)
  assert.match(prompt, /새 사실을 추가하는 근거로 쓰지 않습니다/)
  assert.match(prompt, /키감 좋음, 무게 아쉬움/)
})

test('buildReviewPrompt includes rewrite instructions for existing reviews', () => {
  const { prompt } = buildReviewPrompt({
    rating: 4,
    keywords: ['키감 좋음', '무게 아쉬움'],
    length: 'medium',
    tone: 'neutral',
    category: 'product',
    productContext: '사용자가 직접 경험한 내용:\n키감은 좋았지만 무게가 조금 아쉬웠습니다.',
    previousReview: '키감이 좋고 전체적으로 만족스러운 키보드였습니다.',
    rewriteInstruction: '광고 문구처럼 보이는 표현을 줄이고 담백하게 바꿔 주세요.',
  })

  assert.match(prompt, /기존 리뷰:/)
  assert.match(prompt, /수정 지시:/)
  assert.match(prompt, /광고 문구처럼 보이는 표현/)
  assert.match(prompt, /새 사실은 추가하지 않습니다/)
})

test('buildReviewPrompt asks for subjective experience-based writing', () => {
  const { prompt } = buildReviewPrompt({
    rating: 4,
    keywords: ['마감 안정감', '사용감 편함'],
    length: 'medium',
    tone: 'friendly',
    category: 'product',
  })

  assert.match(prompt, /사용자가 직접 써 본 후기/)
  assert.match(prompt, /1인칭 체감 표현/)
  assert.match(prompt, /장면 중심/)
})

test('buildReviewPrompt gates cosmetics guidance to matching review evidence', () => {
  const cosmeticReview = buildReviewPrompt({
    rating: 5,
    keywords: ['부드러운 발림성', '촉촉한 마무리감'],
    length: 'medium',
    tone: 'friendly',
    category: 'product',
  }).prompt
  const keyboardReview = buildReviewPrompt({
    rating: 4,
    keywords: ['마감 안정감', '각도 조절 편함'],
    length: 'medium',
    tone: 'friendly',
    category: 'product',
  }).prompt

  assert.match(cosmeticReview, /화장품\/뷰티 상품으로 확인되는 경우/)
  assert.match(cosmeticReview, /발림성/)
  assert.doesNotMatch(keyboardReview, /발림성/)
  assert.doesNotMatch(keyboardReview, /보습감/)
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
  assert.match(prompt, /키워드가 적어도 같은 말을 늘리지 말고/)
  assert.match(prompt, /최소 90자 이상/)
})

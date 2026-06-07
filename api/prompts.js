import {
  REVIEW_CATEGORY_MAP,
  getReviewSubcategoryMeta,
  normalizeReviewCategory,
} from '../shared/reviewCategories.js'
import {
  getReviewMinChars,
  getReviewLengthPrompt,
  isSparseLongReview,
  normalizeReviewLength,
  normalizeReviewTone,
} from '../shared/reviewOptions.js'
import { isLikelyKeywordPhrase } from './keywordUtils.js'

const REVIEW_TONE_PROMPT_MAP = {
  neutral: '차분하고 자연스럽게 씁니다. 과장하지 말고 관찰한 사실 중심으로 씁니다.',
  friendly: '친근하지만 구체적으로 씁니다. 감정은 자연스럽게, 내용은 사실 중심으로 씁니다.',
  formal: '정중하고 담백하게 씁니다. 불필요한 감탄이나 과장은 피하고 명확하게 씁니다.',
  casual: '편한 말투로 쓰되, 실제 관찰 포인트가 흐려지지 않게 씁니다.',
}

const COSMETIC_REVIEW_PATTERN =
  /화장품|뷰티|스킨|로션|크림|수분|보습|앰플|세럼|에센스|토너|선크림|자외선|클렌징|쿠션|파운데이션|립|틴트|마스카라|아이섀도|블러셔|발림|흡수|밀착|마무리감|지속력|피부/

function joinPromptLines(...parts) {
  return parts
    .flat()
    .filter((part) => typeof part === 'string' && part.trim())
    .join('\n')
}

function normalizeKeywordPhrases(values, limit = Infinity) {
  if (!Array.isArray(values)) return []
  return values
    .filter((v) => typeof v === 'string' && v.trim())
    .map((v) => v.trim())
    .filter((v) => isLikelyKeywordPhrase(v))
    .slice(0, limit)
}

function normalizeSourceContext(productContext) {
  return typeof productContext === 'string' ? productContext.trim().slice(0, 2800) : ''
}

function normalizeReviewRewriteText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function buildRewriteBlock(previousReview, rewriteInstruction) {
  const safePreviousReview = normalizeReviewRewriteText(previousReview, 1600)
  const safeRewriteInstruction = normalizeReviewRewriteText(rewriteInstruction, 300)
  if (!safePreviousReview || !safeRewriteInstruction) return ''
  return joinPromptLines(
    '기존 리뷰:',
    safePreviousReview,
    '수정 지시:',
    safeRewriteInstruction,
    '재작성 기준:',
    '- 기존 리뷰의 핵심 경험과 선택 키워드는 유지합니다.',
    '- 수정 지시의 방향으로 문장, 길이, 말투, 강조점만 바꿉니다.',
    '- 입력 근거와 기존 리뷰에 없는 새 사실은 추가하지 않습니다.',
  )
}

function isCosmeticReviewContext(category, values) {
  return category === 'product' && values.some((value) => COSMETIC_REVIEW_PATTERN.test(value))
}

export function keywordSentimentGuide(rating) {
  if (rating <= 1) {
    return '매우 불만족: 불편했던 사실과 문제 지점을 감정 과열 없이 구체적으로 뽑습니다.'
  }
  if (rating <= 2) {
    return '불만족: 아쉬웠던 실제 요소를 중심으로 뽑고, 감정 표현만 반복하지 않습니다.'
  }
  if (rating < 4) {
    return '보통: 장단점이 함께 보이도록 실제 체감 요소를 중심으로 뽑습니다.'
  }
  if (rating < 5) {
    return '만족: 좋았던 포인트를 구체적으로 뽑되 막연한 칭찬은 줄입니다.'
  }
  return '매우 만족: 눈에 띄는 장점을 구체적으로 뽑고 카테고리 공용 문구로 흐르지 않게 합니다.'
}

function buildSpecificityGuide(category) {
  return category === 'place'
    ? '장소라면 위치 인상, 동선, 좌석, 조명, 소음, 청결, 응대, 대기, 편의 시설처럼 실제 체험 근거가 있는 요소만 사용합니다.'
    : '상품이라면 내용물 형태, 색감, 질감, 양, 향, 사용감, 재질, 무게, 크기, 마감, 구성, 옵션처럼 실제 상품 근거가 있는 요소만 사용합니다.'
}

function buildGenericBan(category) {
  return category === 'place'
    ? '금지: "분위기 좋음", "깔끔함", "만족", "가성비", "무난함"처럼 어느 장소에나 붙는 표현.'
    : '금지: "좋음", "깔끔함", "만족", "가성비", "무난함"처럼 어느 상품에나 붙는 표현.'
}

function buildUniqueTraitRule(category) {
  return category === 'place'
    ? '키워드 중 최소 1개는 업종 일반론이 아니라 그 장소에서만 확인되는 구체 특성으로 만듭니다.'
    : '키워드 중 최소 1개는 상품군 일반론이 아니라 그 상품에서만 확인되는 구체 특성으로 만듭니다.'
}

function buildFoodEvaluationGuide(category) {
  return category === 'place'
    ? '음식이나 메뉴가 확인되면 플레이팅, 색감, 재료 신선도, 양, 식감, 맛의 방향처럼 근거가 있는 요소만 반영합니다. 확인되지 않는 메뉴명이나 맛은 추측하지 않습니다.'
    : ''
}

function buildProductContentsPriorityGuide(category) {
  return category === 'product'
    ? '상품 리뷰에서는 포장, 용기, 케이스 설명보다 실제 내용물의 모양, 색, 질감, 상태, 사용감을 우선합니다. 포장은 파손, 보관, 위생처럼 사용 판단에 직접 영향이 있을 때만 짧게 다룹니다.'
    : ''
}

function buildCosmeticEvaluationGuide(category) {
  return category === 'product'
    ? '화장품/뷰티 상품으로 확인되는 경우에만 발림성, 흡수감, 보습감, 밀착감, 마무리감, 지속력, 피부에 바로 느껴지는 사용감을 우선 반영합니다. 성분 효능, 미백, 주름 개선, 트러블 치료처럼 확인하기 어려운 기능성 효과는 만들지 않습니다.'
    : ''
}

function buildKeywordCosmeticGuide(category) {
  return category === 'product'
    ? '화장품/뷰티 상품으로 확인되는 경우에만 용기나 패키지 중심 키워드를 피하고 내용물의 제형, 색감, 광택, 점도, 향, 발림, 흡수, 보습, 마무리감처럼 사용자가 바로 체감할 수 있는 키워드를 우선합니다.'
    : ''
}

function buildSubjectiveReviewGuide(category) {
  return category === 'place'
    ? '방문자가 직접 느낀 후기처럼 1인칭 체감 표현을 자연스럽게 섞고, 공간을 이용하면서 좋았거나 아쉬웠던 점을 장면 중심으로 씁니다.'
    : '사용자가 직접 써 본 후기처럼 1인칭 체감 표현을 자연스럽게 섞고, 실제 사용하면서 좋았거나 아쉬웠던 점을 장면 중심으로 씁니다.'
}

function buildSourceBlock(productContext) {
  const safeProductContext = normalizeSourceContext(productContext)
  return safeProductContext
    ? ['입력 근거:', safeProductContext].join('\n')
    : ''
}

function buildStructuredEvidenceRules(productContext) {
  const hasObservedEvidence =
    productContext.includes('사진/상품 정보에서 확인한 근거:') ||
    productContext.includes('observedEvidence:')
  const hasUserExperience =
    productContext.includes('사용자가 직접 경험한 내용:') ||
    productContext.includes('userExperience:')
  if (!hasObservedEvidence && !hasUserExperience) return ''
  return joinPromptLines(
    hasObservedEvidence
      ? '- observedEvidence는 상품/장소의 객관 정보와 사진에서 보이는 정보로만 사용합니다.'
      : '',
    hasUserExperience
      ? '- userExperience는 사용자가 직접 겪은 장점, 아쉬운 점, 체감 표현의 근거로만 사용합니다.'
      : '',
    hasUserExperience
      ? '- 경험 표현은 "사용자가 직접 경험한 내용"과 선택 키워드에 들어 있는 내용만 바탕으로 씁니다.'
      : '',
    '- selectedKeywords는 반드시 반영하되, observedEvidence와 userExperience에 없는 새 사실을 추가하는 근거로 쓰지 않습니다.',
  )
}

function buildSubcategoryGuide(category, subcategory) {
  const meta = getReviewSubcategoryMeta(category, subcategory)
  if (!meta) return ''
  return `- 세부 분야는 "${meta.label}"입니다. ${meta.focus}에 특히 맞추고, ${meta.avoid}.`
}

function buildKeywordSourceGuide({ imageCount, productContext, category }) {
  const sourceBlock = buildSourceBlock(productContext)
  if (sourceBlock) {
    return joinPromptLines(
      sourceBlock,
      '위 입력 근거에 있는 상품명, 설명, 선택 옵션, 페이지 수집 상태, 링크 경로에서 확인되는 항목만 사용합니다.',
    )
  }

  const imageText =
    imageCount > 1
      ? `사진 ${imageCount}장을 함께 보고 공통 카테고리 문구보다 사진마다 실제로 보이는 차이를 우선합니다.`
      : '사진 1장을 기준으로 사진에서 확인되는 구체 특징만 뽑습니다.'
  return joinPromptLines(
    imageText,
    buildFoodEvaluationGuide(category),
  )
}

export function buildKeywordPrompt({
  rating,
  category,
  subcategory = '',
  imageCount = 1,
  productContext = '',
  minKeywordCount,
  maxKeywordCount,
  previousKeywords = [],
}) {
  const safeCategory = normalizeReviewCategory(category)
  const categoryMeta = REVIEW_CATEGORY_MAP[safeCategory]
  const safeProductContext = normalizeSourceContext(productContext)
  const safePreviousKeywords = normalizeKeywordPhrases(previousKeywords, maxKeywordCount)
  const productContentGuide = buildProductContentsPriorityGuide(safeCategory)
  const cosmeticGuide = isCosmeticReviewContext(safeCategory, [safeProductContext])
    ? joinPromptLines(buildKeywordCosmeticGuide(safeCategory), buildCosmeticEvaluationGuide(safeCategory))
    : ''

  return joinPromptLines(
    `역할: ${categoryMeta.label} 리뷰에 바로 쓸 수 있는 관찰형 키워드를 생성합니다.`,
    buildKeywordSourceGuide({
      imageCount,
      productContext: safeProductContext,
      category: safeCategory,
    }),
    '품질 기준:',
    `- 별점 ${rating}점의 감정 방향을 반영합니다. ${keywordSentimentGuide(rating)}`,
    `- ${categoryMeta.focus}에 맞는 사실만 사용합니다.`,
    buildSubcategoryGuide(safeCategory, subcategory),
    `- ${buildSpecificityGuide(safeCategory)}`,
    `- ${buildUniqueTraitRule(safeCategory)}`,
    buildStructuredEvidenceRules(safeProductContext),
    `- ${buildGenericBan(safeCategory)}`,
    productContentGuide ? `- ${productContentGuide}` : '',
    cosmeticGuide ? `- ${cosmeticGuide}` : '',
    safePreviousKeywords.length
      ? `- 직전 조합 ${JSON.stringify(safePreviousKeywords)}와 같은 말만 반복하지 말고 최소 1개 이상은 다른 관찰 포인트로 바꿉니다.`
      : '',
    '금지사항:',
    '- 사진, 상품 페이지, 입력 근거에서 직접 확인되지 않는 내용은 만들지 않습니다.',
    `- ${categoryMeta.avoid}.`,
    '- 광고 문장, 감탄사, 카테고리 공용 표현, 완성된 리뷰 문장을 만들지 않습니다.',
    '출력 형식:',
    `- ${minKeywordCount}개 이상 ${maxKeywordCount}개 이하의 서로 다른 짧은 명사구만 출력합니다.`,
    '- JSON만 출력합니다.',
    '{"keywords":["...","...","..."]}',
  )
}

export function buildReviewPrompt({
  rating,
  keywords,
  length,
  tone,
  category,
  subcategory = '',
  productContext = '',
  previousReview = '',
  rewriteInstruction = '',
}) {
  const safeKeywords = normalizeKeywordPhrases(keywords)
  const safeLength = normalizeReviewLength(length)
  const safeTone = normalizeReviewTone(tone)
  const safeCategory = normalizeReviewCategory(category)
  const categoryMeta = REVIEW_CATEGORY_MAP[safeCategory]
  const minReviewChars = getReviewMinChars(safeLength)
  const safeProductContext = normalizeSourceContext(productContext)
  const rewriteBlock = buildRewriteBlock(previousReview, rewriteInstruction)
  const foodGuide = buildFoodEvaluationGuide(safeCategory)
  const productContentGuide = buildProductContentsPriorityGuide(safeCategory)
  const cosmeticGuide = isCosmeticReviewContext(safeCategory, [
    safeProductContext,
    ...safeKeywords,
  ])
    ? buildCosmeticEvaluationGuide(safeCategory)
    : ''
  const sparseLongReviewGuide = isSparseLongReview(safeLength, safeKeywords.length)
    ? '선택된 키워드가 적어도 같은 말을 늘리지 말고, 입력 근거와 키워드에서 확인되는 구체 요소를 더 자세히 풀어 씁니다.'
    : ''

  return {
    prompt: joinPromptLines(
      `역할: ${categoryMeta.label} 리뷰를 작성합니다.`,
      buildSourceBlock(safeProductContext),
      rewriteBlock,
      '입력값:',
      `- selectedKeywords: ${safeKeywords.join(', ')}`,
      `- 별점: ${rating}점`,
      `- 길이: ${getReviewLengthPrompt(safeLength)}`,
      `- 톤: ${REVIEW_TONE_PROMPT_MAP[safeTone]}`,
      '작성 기준:',
      `- ${buildSubjectiveReviewGuide(safeCategory)}`,
      `- ${buildSpecificityGuide(safeCategory)}`,
      buildSubcategoryGuide(safeCategory, subcategory),
      buildStructuredEvidenceRules(safeProductContext),
      `- 다음 키워드는 반드시 반영하되 그대로 나열하지 말고 자연스러운 문장 안에 녹입니다: ${safeKeywords.join(', ')}.`,
      `- ${categoryMeta.focus}에 맞는 사실만 사용하고, ${categoryMeta.avoid}.`,
      `- ${buildGenericBan(safeCategory)}`,
      foodGuide ? `- ${foodGuide}` : '',
      productContentGuide ? `- ${productContentGuide}` : '',
      cosmeticGuide ? `- ${cosmeticGuide}` : '',
      sparseLongReviewGuide ? `- ${sparseLongReviewGuide}` : '',
      '금지사항:',
      '- 입력 근거에 없는 브랜드명, 가격, 배송 속도, 방문 날짜, 메뉴명, 효능을 만들지 않습니다.',
      '- 광고 문구, 과장된 추천 문장, 다른 상품이나 장소에도 그대로 쓸 수 있는 문장은 피합니다.',
      '출력 형식:',
      `- 최소 ${minReviewChars}자 이상으로 작성합니다.`,
      '- 리뷰 본문만 출력합니다.',
    ),
    safeLength,
    minReviewChars,
  }
}

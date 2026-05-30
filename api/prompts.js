import {
  REVIEW_CATEGORY_MAP,
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
  neutral: '차분하고 균형 있게. 과장하지 말고, 실제 경험처럼 관찰 중심으로 써.',
  friendly: '친근하지만 구체적으로. 감정은 자연스럽게, 내용은 사실 중심으로 써.',
  formal: '정중하고 단정하게. 불필요한 감탄이나 과장은 피하고 명확하게 써.',
  casual: '자연스러운 말투로 쓰되, 핵심은 실제 관찰 포인트에 둬.',
}

const COSMETIC_REVIEW_PATTERN =
  /화장품|뷰티|스킨|로션|크림|수분|보습|앰플|세럼|에센스|토너|선크림|자외선|클렌징|쿠션|파운데이션|컨실러|립|틴트|마스카라|아이섀도|블러셔|향|발림성|흡수|밀착|끈적임|마무리감|지속력|피부/

function joinPromptParts(...parts) {
  return parts.filter(Boolean).join('')
}

function normalizeKeywordPhrases(values, limit = Infinity) {
  if (!Array.isArray(values)) return []
  return values
    .filter((v) => typeof v === 'string' && v.trim())
    .map((v) => v.trim())
    .filter((v) => isLikelyKeywordPhrase(v))
    .slice(0, limit)
}

export function keywordSentimentGuide(rating) {
  if (rating <= 1) {
    return '매우 불만족. 불편했던 사실과 문제 지점을 감정 과잉 없이 구체적으로 담아.'
  }
  if (rating <= 2) {
    return '불만족. 아쉬웠던 실제 요소를 중심으로 쓰고, 감정만 반복하지 마.'
  }
  if (rating < 4) {
    return '보통. 장단점이 함께 보이도록 실제 체험 요소를 중심으로 써.'
  }
  if (rating < 5) {
    return '만족. 좋았던 포인트를 구체적으로 쓰되 뻔한 칭찬은 줄여.'
  }
  return '매우 만족. 눈에 띄는 장점을 구체적으로 담고 카테고리 공용 문구로 흐르지 않게 써.'
}

function buildSpecificityGuide(category) {
  return category === 'place'
    ? '장소라면 위치, 동선, 좌석, 조명, 소음, 청결, 응대, 예약/대기, 시설 상태 같은 실제 체험 요소를 꼭 넣어.'
    : '상품이라면 내용물의 형태, 색상, 질감, 양, 향, 상태, 사용감, 디자인, 소재, 무게, 크기, 마감, 옵션, 배송 같은 실제 상품 요소를 꼭 넣어.'
}

function buildSubjectiveReviewGuide(category) {
  return category === 'place'
    ? '리뷰는 객관 설명문이 아니라 실제 방문자가 느낀 주관적 후기처럼 써. 공간을 이용하며 편했던 점, 아쉬웠던 점, 다시 방문할 때 고려할 점처럼 체감 중심으로 풀어.'
    : '리뷰는 객관 설명문이 아니라 실제 사용자가 느낀 주관적 후기처럼 써. 사용하면서 좋았던 점과 아쉬웠던 점, 내 기준에서 만족한 이유를 체감 중심으로 풀어.'
}

function buildProductContentsPriorityGuide(category) {
  return category === 'product'
    ? '상품 리뷰에서는 포장 용기나 케이스 설명을 최대한 후순위로 두고, 실제 내용물의 모양, 색, 질감, 양, 향, 상태, 사용감을 먼저 설명해. 포장이나 용기는 파손, 밀봉, 보관 편의, 위생처럼 리뷰 판단에 직접 영향을 주는 경우에만 짧게 뒤쪽에 언급해.'
    : ''
}

function buildFoodEvaluationGuide(category) {
  return category === 'place'
    ? '음식이나 메뉴가 사진, 장소 정보, 키워드에서 확인되면 음식의 모양과 맛 평가를 반드시 반영해. 플레이팅, 색감, 양, 재료 신선도, 익힘 정도, 식감, 간, 풍미처럼 실제로 보이거나 입력된 근거가 있는 요소만 사용하고, 확인되지 않은 메뉴명이나 맛은 추측하지 마.'
    : ''
}

function buildCosmeticEvaluationGuide(category) {
  return category === 'product'
    ? '상품이 화장품이나 뷰티 제품으로 보이면 향, 발림성, 흡수력, 보습감, 밀착감, 끈적임, 마무리감, 지속력, 피부 자극 여부, 피부 타입과의 궁합처럼 화장품 리뷰에 맞는 체감 항목을 우선 반영해. 사진이나 키워드에서 확인되지 않은 성분 효과, 의학적 효능, 장기간 변화는 만들지 마.'
    : ''
}

function isCosmeticReviewContext(category, values) {
  return category === 'product' && values.some((value) => COSMETIC_REVIEW_PATTERN.test(value))
}

function buildCategoryGenericBan(category) {
  return category === 'place'
    ? '"분위기 좋음", "깔끔함", "만족", "가성비", "무난함"처럼 어떤 장소에나 붙는 문구는 피하고 실제 장소 특징만 써.'
    : '"좋음", "깔끔함", "만족", "가성비", "무난함"처럼 어떤 상품에나 붙는 문구는 피하고 실제 상품 특징만 써.'
}

function buildUniqueTargetTraitRule(category) {
  return category === 'place'
    ? '키워드 중 최소 1개는 업종이나 장소 카테고리의 일반 특징이 아니라, 이 장소 자체에서만 확인되는 구체 특성으로 만들어.'
    : '키워드 중 최소 1개는 상품 카테고리의 일반 특징이 아니라, 이 상품 자체에서만 확인되는 구체 특성으로 만들어.'
}

export function buildKeywordPrompt({
  rating,
  category,
  imageCount = 1,
  productContext = '',
  minKeywordCount,
  maxKeywordCount,
  previousKeywords = [],
}) {
  const safeCategory = normalizeReviewCategory(category)
  const categoryMeta = REVIEW_CATEGORY_MAP[safeCategory]
  const imageGuide =
    imageCount > 1
      ? `사진 ${imageCount}장을 함께 보고, 공통 카테고리 문구가 아니라 사진마다 실제로 보이는 차이를 우선적으로 뽑아. `
      : '사진 1장을 기준으로, 카테고리 공통말이 아니라 사진에서 확인되는 구체 특징만 뽑아. '
  const safePreviousKeywords = normalizeKeywordPhrases(previousKeywords, maxKeywordCount)
  const variationGuide = safePreviousKeywords.length
    ? `직전 조합 ${JSON.stringify(safePreviousKeywords)}과 같은 말만 다시 쓰지 말고, 최소 1개 이상은 이전과 다른 관찰 포인트를 넣어. `
    : ''

  const safeProductContext =
    typeof productContext === 'string' ? productContext.trim().slice(0, 2800) : ''
  const foodEvaluationGuide = buildFoodEvaluationGuide(safeCategory)
  const productContentsPriorityGuide = buildProductContentsPriorityGuide(safeCategory)
  const cosmeticEvaluationGuide = isCosmeticReviewContext(safeCategory, [safeProductContext])
    ? buildCosmeticEvaluationGuide(safeCategory)
    : ''
  const sourceGuide = safeProductContext
    ? `상품/장소에서 수집한 실제 정보:\n${safeProductContext}\n\n` +
      '위 정보의 상품명, 설명, 선택 옵션, 가격, 페이지 수집 상태, 링크 경로에서 확인되는 구체 항목을 근거로 키워드를 만들어. ' +
      `${buildCategoryGenericBan(safeCategory)} ` +
      `${buildSpecificityGuide(safeCategory)} `
    : imageGuide + (foodEvaluationGuide ? `${foodEvaluationGuide} ` : '')

  return joinPromptParts(
    `${categoryMeta.label} 리뷰용 키워드를 만들어. 뻔한 광고 문구는 금지하고 실제 관찰 포인트만 사용해. `,
    sourceGuide,
    foodEvaluationGuide && safeProductContext ? `${foodEvaluationGuide} ` : '',
    productContentsPriorityGuide ? `${productContentsPriorityGuide} ` : '',
    cosmeticEvaluationGuide ? `${cosmeticEvaluationGuide} ` : '',
    variationGuide,
    '이미지나 상품 페이지에서 직접 확인되지 않은 내용은 넣지 말고, 추측은 배제해. ',
    `별점 ${rating}점의 감정 톤은 ${keywordSentimentGuide(rating)}를 반영하되, 문구 자체는 ${categoryMeta.focus}에 맞춰 구체적으로 써. `,
    `주의: ${categoryMeta.avoid}. `,
    `${buildUniqueTargetTraitRule(safeCategory)} `,
    '키워드는 리뷰에서 바로 사용할 수 있는 구체 명사구로만 만들고 일반론, 광고성 문장, 카테고리 공용 표현은 제외해. ',
    `최소 ${minKeywordCount}개, 최대 ${maxKeywordCount}개를 만들고, 각 키워드는 서로 다른 관찰 지점을 담아. `,
    '형식은 JSON만 출력: {"keywords":["...","...","..."]}',
  )
}


export function buildReviewPrompt({ rating, keywords, length, tone, category }) {
  const safeKeywords = normalizeKeywordPhrases(keywords)
  const safeLength = normalizeReviewLength(length)
  const safeTone = normalizeReviewTone(tone)
  const safeCategory = normalizeReviewCategory(category)
  const categoryMeta = REVIEW_CATEGORY_MAP[safeCategory]
  const minReviewChars = getReviewMinChars(safeLength)
  const sparseLongReviewGuide = isSparseLongReview(safeLength, safeKeywords.length)
    ? '선택한 키워드가 적어도 길게 쓸 때는 같은 말을 늘리지 말고, 카테고리 공통 문장 대신 실제 대상에서 확인한 구체 요소를 더 강하게 풀어 써. '
    : ''
  const specificityGuide = buildSpecificityGuide(safeCategory)
  const genericBan = buildCategoryGenericBan(safeCategory)
  const foodEvaluationGuide = buildFoodEvaluationGuide(safeCategory)
  const productContentsPriorityGuide = buildProductContentsPriorityGuide(safeCategory)
  const subjectiveReviewGuide = buildSubjectiveReviewGuide(safeCategory)
  const cosmeticEvaluationGuide = isCosmeticReviewContext(safeCategory, safeKeywords)
    ? buildCosmeticEvaluationGuide(safeCategory)
    : ''

  return {
    prompt: joinPromptParts(
      `대상: ${categoryMeta.label}\n키워드: ${safeKeywords.join(', ')}\n별점: ${rating}점\n길이: ${getReviewLengthPrompt(safeLength)}\n톤: ${REVIEW_TONE_PROMPT_MAP[safeTone]}\n\n`,
      `${categoryMeta.label} 리뷰를 쓰되, 누구에게나 붙는 흔한 표현은 빼고 실제 대상의 특징만 드러내. `,
      `${subjectiveReviewGuide} `,
      `${specificityGuide} `,
      foodEvaluationGuide ? `${foodEvaluationGuide} ` : '',
      productContentsPriorityGuide ? `${productContentsPriorityGuide} ` : '',
      cosmeticEvaluationGuide ? `${cosmeticEvaluationGuide} ` : '',
      `다음 키워드는 반드시 반영해: ${safeKeywords.join(', ')}. 하지만 키워드를 그대로 나열하지 말고, 키워드가 가리키는 구체 요소를 중심으로 자연스럽게 풀어 써. `,
      `${categoryMeta.focus}에 맞는 사실만 사용하고, ${categoryMeta.avoid}. `,
      `${genericBan} `,
      '추측, 과장, 광고성 문구, 카테고리 공용 문구, 다른 상품이나 장소에도 그대로 쓸 수 있는 말은 제외해. ',
      sparseLongReviewGuide,
      `최소 ${minReviewChars}자 이상으로, 문장마다 실제 경험의 디테일이 있도록 써.`,
    ),
    safeLength,
    minReviewChars,
  }
}

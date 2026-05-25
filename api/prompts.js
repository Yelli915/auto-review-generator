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
  neutral: '차분하고 균형 있게. 과장하지 말고, 실제 경험한 관찰만 적어.',
  friendly: '친근하지만 구체적으로. 감정은 자연스럽게, 내용은 사실 중심으로 써.',
  formal: '정중하고 단정하게. 불필요한 감탄사나 과장을 피하고 명확하게 써.',
  casual: '자연스러운 말투로 쓰되, 핵심은 실제 관찰 포인트에 둬.',
}

export function keywordSentimentGuide(rating) {
  if (rating <= 1) {
    return '매우 불만족. 불편했던 사실과 문제 지점을 바탕으로 구체적으로 써.'
  }
  if (rating <= 2) {
    return '불만족. 아쉬웠던 실제 요소를 중심으로 적고, 감정만 반복하지 마.'
  }
  if (rating < 4) {
    return '보통. 장단점이 함께 보이도록 실제 체험 요소를 중심으로 써.'
  }
  if (rating < 5) {
    return '만족. 좋았던 포인트를 구체적으로 적되 흔한 칭찬어는 줄여.'
  }
  return '매우 만족. 뛰어난 점을 구체적으로 써서 카테고리 공용 문구로 흐르지 않게 해.'
}

function buildSpecificityGuide(category) {
  return category === 'place'
    ? '장소 후기라면 위치, 동선, 좌석, 조명, 소음, 청결, 응대, 예약/대기, 시설 상태 같은 실제 체험 요소를 꼭 넣어.'
    : '상품 후기라면 디자인, 색상, 소재, 무게, 크기, 마감, 사용감, 옵션, 배송, 포장 같은 실제 상품 요소를 꼭 넣어.'
}

function buildCategoryGenericBan(category) {
  return category === 'place'
    ? '예: "분위기 좋음", "깔끔함", "만족", "가성비", "무난함"처럼 어느 장소에나 붙는 문구는 피하고, 실제 장소 특징만 써.'
    : '예: "좋음", "깔끔함", "만족", "가성비", "무난함"처럼 어느 상품에나 붙는 문구는 피하고, 실제 상품 특징만 써.'
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
  const safePreviousKeywords = Array.isArray(previousKeywords)
    ? previousKeywords
        .filter((v) => typeof v === 'string' && v.trim())
        .map((v) => v.trim())
        .filter((v) => isLikelyKeywordPhrase(v))
        .slice(0, maxKeywordCount)
    : []
  const variationGuide = safePreviousKeywords.length
    ? `직전 조합 ${JSON.stringify(safePreviousKeywords)}과 같은 말은 다시 쓰지 말고, 최소 1개 이상은 완전히 다른 관찰 포인트를 넣어. `
    : ''

  const safeProductContext =
    typeof productContext === 'string' ? productContext.trim().slice(0, 2800) : ''
  const sourceGuide = safeProductContext
    ? `상품/장소에서 수집한 실제 정보:\n${safeProductContext}\n\n이 정보에 적힌 제목, 설명, 옵션, 위치, 시설, 재질, 크기, 분위기 같은 구체 항목을 기준으로 키워드를 만들어. ` +
      `${buildCategoryGenericBan(safeCategory)} ` +
      `반드시 ${buildSpecificityGuide(safeCategory)} `
    : imageGuide

  return (
    `${categoryMeta.label} 리뷰용 키워드를 만들되, 흔한 후기 문구는 금지하고 실제 관찰 포인트만 사용해. ` +
    sourceGuide +
    variationGuide +
    '이미지나 상품 페이지에서 직접 확인되지 않은 내용은 넣지 말고, 추측은 배제해. ' +
    `별점 ${rating}점의 감정 톤은 ${keywordSentimentGuide(rating)}를 반영하되, 문구 자체는 ${categoryMeta.focus}에 맞춰 구체적으로 써. ` +
    `주의: ${categoryMeta.avoid}. ` +
    '키워드는 리뷰에서 바로 재사용할 수 있는 구체 명사구로만 만들고, 일반론이나 광고성 문장, 카테고리 공용표현은 제외해. ' +
    `최소 ${minKeywordCount}개, 최대 ${maxKeywordCount}개를 만들되, 각 키워드는 서로 다른 관찰 지점을 담아. ` +
    '형식은 JSON만 출력: {"keywords":["...","...","..."]}'
  )
}

export function buildReviewPrompt({ rating, keywords, length, tone, category }) {
  const safeKeywords = Array.isArray(keywords)
    ? keywords
        .filter((v) => typeof v === 'string' && v.trim())
        .map((v) => v.trim())
        .filter((v) => isLikelyKeywordPhrase(v))
    : []
  const safeLength = normalizeReviewLength(length)
  const safeTone = normalizeReviewTone(tone)
  const safeCategory = normalizeReviewCategory(category)
  const categoryMeta = REVIEW_CATEGORY_MAP[safeCategory]
  const minReviewChars = getReviewMinChars(safeLength)
  const sparseLongReviewGuide = isSparseLongReview(safeLength, safeKeywords.length)
    ? '선택한 키워드가 적어서 길게 쓰면 흔한 말로 흐를 수 있으니, 카테고리 공통문장 대신 실제 대상에서 확인된 구체 요소를 더 강하게 써. '
    : ''
  const specificityGuide = buildSpecificityGuide(safeCategory)
  const genericBan = buildCategoryGenericBan(safeCategory)

  return {
    prompt:
      `대상: ${categoryMeta.label}\n키워드: ${safeKeywords.join(', ')}\n별점: ${rating}점\n길이: ${getReviewLengthPrompt(safeLength)}\n톤: ${REVIEW_TONE_PROMPT_MAP[safeTone]}\n\n` +
      `${categoryMeta.label} 리뷰를 쓰되, 누구에게나 붙는 뻔한 표현은 빼고 실제 대상의 특징만 드러내. ` +
      `${specificityGuide} ` +
      `다음 키워드는 반드시 반영해: ${safeKeywords.join(', ')}. 하지만 키워드를 그대로 나열하지 말고, 키워드가 가리키는 구체 요소를 중심으로 자연스럽게 풀어써. ` +
      `${categoryMeta.focus}에 맞는 사실만 유지하고, ${categoryMeta.avoid}. ` +
      `${genericBan} ` +
      '추측, 과장, 광고성 문구, 카테고리 공용 문구, 다른 상품이나 장소에도 그대로 쓸 수 있는 말은 제외해. ' +
      sparseLongReviewGuide +
      `최소 ${minReviewChars}자 이상으로, 문장마다 실제 경험한 디테일이 남도록 써.`
    ,
    safeLength,
    minReviewChars,
  }
}

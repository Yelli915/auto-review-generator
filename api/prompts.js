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
  neutral:
    '1인칭 구매자 입장의 자연스러운 온라인 쇼핑몰 리뷰 말투. 과장하지 말 것.',
  friendly:
    '친근하고 부드러운 말투. 이모티콘·느낌표 남발은 피할 것.',
  formal:
    '정중한 존댓말(~습니다·해요체)로 격식 있게. 무례하지 않게.',
  casual:
    '편한 일상 반말(~했어, ~야 느낌). 공격적·무례한 표현은 금지.',
}

export function keywordSentimentGuide(rating) {
  if (rating <= 1) {
    return '매우 낮은 만족도. 공격적 표현은 피하고 불편했던 점을 사실 기반으로 제안.'
  }
  if (rating <= 2) {
    return '낮은 만족도. 부정적 단서를 중심으로 하되 감정 과잉 없이 제안.'
  }
  if (rating < 4) {
    return '보통 만족도. 장단점이 섞인 중립 키워드 위주로 제안.'
  }
  if (rating < 5) {
    return '높은 만족도. 긍정 키워드를 중심으로 하되 과장은 피해서 제안.'
  }
  return '매우 높은 만족도. 강한 긍정 키워드를 중심으로 하되 광고처럼 과장하지 말고 제안.'
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
      ? `첨부된 ${imageCount}장의 이미지를 같은 리뷰 대상의 보조 정보로 보고 종합해. `
      : '첨부된 이미지를 리뷰 대상의 보조 정보로 봐. '
  const safePreviousKeywords = Array.isArray(previousKeywords)
    ? previousKeywords
        .filter((v) => typeof v === 'string' && v.trim())
        .map((v) => v.trim())
        .filter((v) => isLikelyKeywordPhrase(v))
        .slice(0, maxKeywordCount)
    : []
  const variationGuide = safePreviousKeywords.length
    ? `직전 키워드 조합 ${JSON.stringify(safePreviousKeywords)}와 완전히 같은 목록을 다시 내지 마. 비슷한 방향은 가능하지만 최소 1개 이상은 다른 표현이나 다른 관찰 포인트로 바꿔. `
    : ''

  const safeProductContext =
    typeof productContext === 'string' ? productContext.trim().slice(0, 2800) : ''
  const sourceGuide = safeProductContext
    ? `상품 링크에서 수집한 공개 정보:\n${safeProductContext}\n\n위 상품 정보를 리뷰 대상의 근거로 보고, 링크에 없는 실제 사용 기간/배송 속도/가격/구매처는 새로 만들지 마. `
    : imageGuide

  return (
    `${categoryMeta.label} 리뷰에 사용할 키워드를 한국어 짧은 구로만 작성해. ` +
    sourceGuide +
    variationGuide +
    '이미지에서 직접 확인 가능한 단서를 우선하고, 보이지 않는 사실은 추측하지 마. ' +
    `별점 ${rating}점 기준 감정은 ${keywordSentimentGuide(rating)} 반영해. ` +
    `대상 기준은 ${categoryMeta.focus}으로 잡아. ` +
    `주의사항: ${categoryMeta.avoid}. ` +
    '키워드는 리뷰에 바로 사용할 수 있는 짧은 명사구 또는 형용사구로 작성해. ' +
    `서로 다른 키워드를 ${minKeywordCount}~${maxKeywordCount}개 작성하고, 모든 값은 한글을 포함해야 해. ` +
    '설명, 서문, 코드블록, 영어 문장 없이 JSON만 출력해. ' +
    '형식: {"keywords":["...","...","..."]}'
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
  const sparseLongReviewGuide =
    isSparseLongReview(safeLength, safeKeywords.length)
      ? '선택된 키워드가 적으므로 같은 키워드를 반복해 분량을 늘리지 말고, 대상·별점·이미지에서 확인 가능한 단서를 바탕으로 자연스럽게 내용을 확장해. '
      : ''

  return {
    prompt:
      `대상: ${categoryMeta.label}\n키워드: ${safeKeywords.join(', ')}\n별점: ${rating}점\n길이: ${getReviewLengthPrompt(safeLength)}\n말투: ${REVIEW_TONE_PROMPT_MAP[safeTone]}\n\n` +
      `${categoryMeta.label} 리뷰처럼 자연스럽게 작성하고, ${categoryMeta.focus}을 문맥에 맞게 반영해. ` +
      `주의사항: ${categoryMeta.avoid}. ` +
      '선택된 키워드를 그대로 나열하지 말고 실제 사용자가 쓴 후기처럼 자연스럽게 연결해. ' +
      sparseLongReviewGuide +
      '사진이나 키워드에서 확인되지 않는 구체 정보는 새로 만들지 마. ' +
      '광고 문구, 과장된 표현, 반복적인 감탄사는 피하고 담백하게 작성해. ' +
      '글자수는 최소 분량 안내일 뿐이며, 글자수를 맞추려고 문장을 중간에서 끝내지 마. ' +
      '문장과 리뷰의 완결성을 우선하고 마지막 문장을 자연스럽게 마무리해. ' +
      `아래 조건을 모두 지켜 리뷰 본문만 작성해. 제목, 머리말, 번호, 목록 없이 최소 ${minReviewChars}자 이상으로 쓰되 완성된 문장으로 끝내 줘.`,
    safeLength,
    minReviewChars,
  }
}

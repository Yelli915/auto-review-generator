import {
  GENERIC_BAN_PHRASES_PLACE,
  GENERIC_BAN_PHRASES_PRODUCT,
} from './config.js'

function findGenericPhraseLeaks(category, reviewText) {
  const phrases = category === 'place' ? GENERIC_BAN_PHRASES_PLACE : GENERIC_BAN_PHRASES_PRODUCT
  return phrases.filter((phrase) => reviewText.includes(phrase))
}

function findUnreflectedKeywords(keywords, reviewText) {
  if (!Array.isArray(keywords)) return []
  return keywords.filter(
    (keyword) => typeof keyword === 'string' && keyword.trim() && !reviewText.includes(keyword.trim()),
  )
}

// 리뷰 스트림 완료 후 실행되는 관찰용 검사입니다. 응답을 막거나 재시도를 트리거하지 않고
// DEBUG_LOGS가 켜져 있을 때만 로그를 남겨, 프롬프트 규칙이 실제로 얼마나 지켜지는지 데이터를 쌓습니다.
export function collectReviewQualityIssues({ category, keywords, reviewText }) {
  const genericPhraseLeaks = findGenericPhraseLeaks(category, reviewText)
  const unreflectedKeywords = findUnreflectedKeywords(keywords, reviewText)
  if (!genericPhraseLeaks.length && !unreflectedKeywords.length) return null
  return { genericPhraseLeaks, unreflectedKeywords }
}

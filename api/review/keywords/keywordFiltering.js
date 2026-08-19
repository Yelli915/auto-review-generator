import {
  CONTAINER_CENTERED_KEYWORD_RE,
  CONTAINER_REVIEW_EXCEPTION_RE,
  COSMETIC_CONTEXT_RE,
} from '../config.js'
import { normalizeKeywordSet } from './keywordSets.js'

function isProductCategory(category) {
  return String(category || '').trim() === 'product'
}

function shouldFilterCosmeticContainerKeywords({
  category,
  productContext,
  keywords,
}) {
  if (!isProductCategory(category)) return false
  if (typeof productContext === 'string' && COSMETIC_CONTEXT_RE.test(productContext)) {
    return true
  }
  if (Array.isArray(keywords) && keywords.some((keyword) => COSMETIC_CONTEXT_RE.test(keyword))) {
    return true
  }
  return false
}

export function isCosmeticContainerOnlyKeyword(keyword) {
  if (typeof keyword !== 'string') return false
  if (!CONTAINER_CENTERED_KEYWORD_RE.test(keyword)) return false
  return !CONTAINER_REVIEW_EXCEPTION_RE.test(keyword)
}

export function filterCosmeticContainerKeywords(keywords, options = {}) {
  const normalized = normalizeKeywordSet(keywords)
  if (!normalized.length) return { keywords: null, removed: [] }
  if (!shouldFilterCosmeticContainerKeywords({ ...options, keywords: normalized })) {
    return { keywords: normalized, removed: [] }
  }

  const filtered = []
  const removed = []
  for (const keyword of normalized) {
    if (isCosmeticContainerOnlyKeyword(keyword)) {
      removed.push(keyword)
    } else {
      filtered.push(keyword)
    }
  }
  return {
    keywords: filtered.length ? filtered : null,
    removed,
  }
}

export function appendContainerKeywordRetryGuidance(prompt, removedKeywords) {
  const removed = normalizeKeywordSet(removedKeywords)
  if (!removed.length) return prompt
  return (
    `${prompt}\n\n` +
    `방금 제거된 포장/용기 중심 키워드: ${removed.join(', ')}\n` +
    '다음 시도에서는 용기, 케이스, 패키지 대신 실제 내용물의 제형, 색감, 향, 발림, 흡수, 사용감처럼 리뷰 판단에 직접 쓰이는 키워드만 JSON으로 출력해.'
  )
}

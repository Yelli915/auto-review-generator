import { hasHangul, isLikelyKeywordPhrase } from './keywordUtils.js'
import { KEYWORD_LEN_MAX, KEYWORD_LEN_MIN } from '../config.js'

export function sanitizeKeywordArray(arr) {
  if (!Array.isArray(arr)) return null
  const cleaned = arr
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(
      (s) =>
        s.length >= KEYWORD_LEN_MIN &&
        s.length <= KEYWORD_LEN_MAX &&
        hasHangul(s) &&
        isLikelyKeywordPhrase(s),
    )
  return cleaned.length ? Array.from(new Set(cleaned)) : null
}

export function normalizeKeywordSet(keywords) {
  const normalized = Array.isArray(keywords)
    ? keywords
        .map((keyword) =>
          typeof keyword === 'string' ? keyword.replace(/\s+/g, ' ').trim() : '',
        )
        .filter(Boolean)
    : []
  return sanitizeKeywordArray(normalized) || []
}

export function keywordSignature(keywords) {
  return normalizeKeywordSet(keywords)
    .sort((a, b) => a.localeCompare(b, 'ko'))
    .join('|')
}

export function isSameKeywordSet(a, b) {
  const aSignature = keywordSignature(a)
  return Boolean(aSignature) && aSignature === keywordSignature(b)
}

export function appendKeywordRetryGuidance(prompt, rejectedSets) {
  const safeRejectedSets = Array.isArray(rejectedSets)
    ? rejectedSets.map((set) => normalizeKeywordSet(set)).filter((set) => set.length > 0)
    : []
  if (!safeRejectedSets.length) return prompt

  const previousRuns = safeRejectedSets
    .map((set, index) => `${index + 1}. ${set.join(', ')}`)
    .join('\n')

  return (
    `${prompt}\n\n` +
    '금지된 이전 키워드 조합:\n' +
    `${previousRuns}\n\n` +
    '이 목록 중 어떤 결과와도 같은 조합을 다시 내지 마. ' +
    '최소 1개는 다른 표현이나 다른 관찰 포인트로 바꾸고 JSON만 출력해.'
  )
}

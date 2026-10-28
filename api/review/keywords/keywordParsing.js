import { hasHangul } from '../../../shared/keywordPhrase.js'
import { KEYWORDS_MAX_COUNT, KEYWORDS_MIN_COUNT } from '../config.js'
import { sanitizeKeywordArray } from './keywordSets.js'

function gatherKeywordResponseText(data) {
  const candidates = Array.isArray(data?.candidates) ? data.candidates : []
  const parts = candidates.flatMap((candidate) =>
    Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [],
  )
  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim()
}

// 키워드 요청은 responseSchema로 JSON 응답을 받습니다. JSON.parse가 실패하는 경우는
// 사실상 응답이 잘린 경우(MAX_TOKENS)뿐이라, 닫힌 따옴표 안의 한글 문구만 건집니다.
export function parseKeywordsFromText(text) {
  if (typeof text !== 'string' || !text.trim()) return null
  try {
    const parsed = JSON.parse(text)
    return sanitizeKeywordArray(parsed?.keywords) || sanitizeKeywordArray(parsed)
  } catch {
    const quoted = Array.from(text.matchAll(/"([^"]+)"/g), (match) => match[1].trim())
    return sanitizeKeywordArray(quoted.filter(hasHangul))
  }
}

export function parseKeywordsFromAny(data) {
  const text = gatherKeywordResponseText(data)
  const keywords = parseKeywordsFromText(text)
  if (!keywords) return { keywords: null, rawText: text }
  if (keywords.length < KEYWORDS_MIN_COUNT) {
    return { keywords: null, rawText: text, tooFew: true, partial: keywords }
  }
  return { keywords: keywords.slice(0, KEYWORDS_MAX_COUNT), rawText: text }
}

export function summarizeKeywordDebug(data) {
  const candidates = Array.isArray(data?.candidates) ? data.candidates : []
  const first = candidates[0]
  return {
    candidateCount: candidates.length,
    finishReason: first?.finishReason ?? null,
    blockReason: data?.promptFeedback?.blockReason ?? null,
  }
}

export function describeKeywordGeminiIssue(data, extractedText) {
  const blockReason = data?.promptFeedback?.blockReason
  if (blockReason) {
    return '입력이 안전 정책으로 인해 차단되었습니다. 다른 이미지로 시도해 주세요.'
  }
  const cand = data?.candidates?.[0]
  if (!cand) {
    return '모델이 응답 후보를 반환하지 않았습니다. 잠시 후 다시 시도해 주세요.'
  }
  const hasText =
    typeof extractedText === 'string' && extractedText.trim().length > 0
  const fr = cand.finishReason
  if (fr === 'MAX_TOKENS') {
    return '응답이 중간에 잘렸습니다. 키워드를 다시 생성해 주세요.'
  }
  if (!hasText) {
    if (
      fr === 'SAFETY' ||
      fr === 'PROHIBITED_CONTENT' ||
      fr === 'IMAGE_SAFETY' ||
      fr === 'IMAGE_PROHIBITED_CONTENT'
    ) {
      return '안전 정책으로 인해 키워드를 생성할 수 없습니다. 다른 이미지로 시도해 주세요.'
    }
    if (fr === 'RECITATION') {
      return '저작권 정책으로 인해 응답을 생성할 수 없습니다.'
    }
    if (fr && fr !== 'STOP') {
      return `모델이 텍스트 응답을 만들지 못했습니다. (${fr})`
    }
    return '모델이 빈 응답을 반환했습니다. 다시 시도해 주세요.'
  }
  return null
}

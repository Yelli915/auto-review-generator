import { hasHangul } from './keywordUtils.js'
import {
  KEYWORD_LEN_MAX,
  KEYWORD_LEN_MIN,
  KEYWORDS_MAX_COUNT,
  KEYWORDS_MIN_COUNT,
} from '../config.js'
import { sanitizeKeywordArray } from './keywordSets.js'
import { sliceBalancedSegment } from '../../../shared/balancedText.js'

function sanitizeKeywordsField(keywords) {
  if (Array.isArray(keywords)) return sanitizeKeywordArray(keywords)
  if (typeof keywords === 'string') {
    const parts = keywords
      .split(/[,\s\n|/]+/g)
      .map((s) => s.trim())
      .filter(Boolean)
    return sanitizeKeywordArray(parts)
  }
  return null
}

function stripEnglishJsonPreamble(str) {
  if (typeof str !== 'string') return ''
  return str.replace(
    /^\s*(?:here(?:'s| is)?|sure[:,]?|of course[:,]?|json[:,]?|keywords[:,]?)[^[{]*(?=[[{])/i,
    '',
  )
}

function loosenJsonCommas(s) {
  if (typeof s !== 'string') return ''
  return s.replace(/,\s*([}\]])/g, '$1')
}

function trimToJsonStart(s) {
  if (typeof s !== 'string') return ''
  const idx = s.search(/[[{]/)
  return idx >= 0 ? s.slice(idx).trim() : s.trim()
}

function extractQuotedHangulKeywords(text) {
  const out = []
  const re = /"([^"]+)"/g
  let match
  while ((match = re.exec(text)) !== null) {
    const value = match[1].trim()
    if (hasHangul(value)) out.push(value)
  }
  return sanitizeKeywordArray(out)
}

function extractSingleQuotedHangulKeywords(text) {
  const out = []
  const re = /'([^']+)'/g
  let match
  while ((match = re.exec(text)) !== null) {
    const value = match[1].trim()
    if (hasHangul(value)) out.push(value)
  }
  return sanitizeKeywordArray(out)
}

function mergeUniqueKeywordLists(...lists) {
  const merged = lists.flatMap((list) => (Array.isArray(list) ? list : []))
  return sanitizeKeywordArray(merged)
}

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

export function parseKeywordsFromText(text) {
  if (typeof text !== 'string' || !text.trim()) return null
  const raw = text.trim()
  let normalized = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
  normalized = stripEnglishJsonPreamble(normalized)
  normalized = trimToJsonStart(normalized)
  const loose = loosenJsonCommas(normalized)

  const tryParse = (s) => {
    try {
      return JSON.parse(s)
    } catch {
      return null
    }
  }

  for (const candidate of [normalized, loose]) {
    const parsed = tryParse(candidate)
    if (parsed) {
      const fromObject = sanitizeKeywordsField(parsed?.keywords)
      if (fromObject) return fromObject
      const fromArray = sanitizeKeywordArray(parsed)
      if (fromArray) return fromArray
    }
  }

  const objSlice = sliceBalancedSegment(normalized, { openCh: '{' })
  if (objSlice) {
    const parsed = tryParse(loosenJsonCommas(objSlice))
    const fromObject = parsed ? sanitizeKeywordsField(parsed?.keywords) : null
    if (fromObject) return fromObject
  }

  const arraySlice = sliceBalancedSegment(normalized, { openCh: '[' })
  if (arraySlice) {
    const parsed = tryParse(loosenJsonCommas(arraySlice))
    const fromArray = parsed ? sanitizeKeywordArray(parsed) : null
    if (fromArray) return fromArray
  }

  const fromLines = sanitizeKeywordArray(
    normalized
      .split('\n')
      .map((line) => line.replace(/^[\s\-*0-9.()]+/, '').trim())
      .filter(Boolean),
  )
  if (fromLines) return fromLines

  return mergeUniqueKeywordLists(
    extractQuotedHangulKeywords(normalized),
    extractSingleQuotedHangulKeywords(normalized),
  )
}

export function parseKeywordsFromAny(data) {
  const text = gatherKeywordResponseText(data)
  const direct = parseKeywordsFromText(text)
  if (direct && direct.length >= 1) {
    if (direct.length < KEYWORDS_MIN_COUNT) {
      return { keywords: null, rawText: text, tooFew: true, partial: direct }
    }
    return { keywords: direct.slice(0, KEYWORDS_MAX_COUNT), rawText: text }
  }

  const tokenized = text
    .replace(/^(?:keywords|keyword|키워드)\s*:?\s*/i, '')
    .split(/[,\s\n|/]+/g)
    .map((v) => v.replace(/^[\s\-*0-9.()]+/, '').trim())
    .filter(Boolean)
  const cleaned = Array.from(new Set(tokenized)).filter(
    (v) =>
      v.length >= KEYWORD_LEN_MIN &&
      v.length <= KEYWORD_LEN_MAX &&
      hasHangul(v),
  )
  if (cleaned.length >= KEYWORDS_MIN_COUNT) {
    return { keywords: cleaned.slice(0, KEYWORDS_MAX_COUNT), rawText: text }
  }
  if (cleaned.length >= 1) {
    return { keywords: null, rawText: text, tooFew: true, partial: cleaned }
  }
  return { keywords: null, rawText: text }
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

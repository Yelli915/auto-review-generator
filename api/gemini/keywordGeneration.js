import { hasHangul, isLikelyKeywordPhrase } from '../keywordUtils.js'
import { fetchProductAnalysis } from '../productContext.js'
import { buildKeywordPrompt } from '../prompts.js'
import {
  CONTAINER_CENTERED_KEYWORD_RE,
  CONTAINER_REVIEW_EXCEPTION_RE,
  COSMETIC_CONTEXT_RE,
  DEBUG_LOGS,
  KEYWORD_LEN_MAX,
  KEYWORD_LEN_MIN,
  KEYWORD_RETRY_LIMIT,
  KEYWORDS_MAX_COUNT,
  KEYWORDS_MIN_COUNT,
} from './config.js'
import { buildImageParts, validateImagesInput } from './imageInput.js'
import {
  buildKeywordGenerationConfig,
  requestGemini,
  toClientErrorStatus,
} from './geminiClient.js'

function normalizeKeywordSet(keywords) {
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

function appendContainerKeywordRetryGuidance(prompt, removedKeywords) {
  const removed = normalizeKeywordSet(removedKeywords)
  if (!removed.length) return prompt
  return (
    `${prompt}\n\n` +
    `방금 제거된 포장/용기 중심 키워드: ${removed.join(', ')}\n` +
    '다음 시도에서는 용기, 케이스, 패키지 대신 실제 내용물의 제형, 색감, 향, 발림, 흡수, 사용감처럼 리뷰 판단에 직접 쓰이는 키워드만 JSON으로 출력해.'
  )
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

function sliceBalancedSegment(str, openCh, closeCh) {
  const start = str.indexOf(openCh)
  if (start < 0) return ''
  let depth = 0
  let inString = false
  let quote = ''
  let escaped = false
  for (let i = start; i < str.length; i += 1) {
    const ch = str[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === quote) {
        inString = false
        quote = ''
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      inString = true
      quote = ch
      continue
    }
    if (ch === openCh) depth += 1
    if (ch === closeCh) {
      depth -= 1
      if (depth === 0) return str.slice(start, i + 1)
    }
  }
  return ''
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

  const objSlice = sliceBalancedSegment(normalized, '{', '}')
  if (objSlice) {
    const parsed = tryParse(loosenJsonCommas(objSlice))
    const fromObject = parsed ? sanitizeKeywordsField(parsed?.keywords) : null
    if (fromObject) return fromObject
  }

  const arraySlice = sliceBalancedSegment(normalized, '[', ']')
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

function parseKeywordsFromAny(data) {
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

function summarizeKeywordDebug(data) {
  const candidates = Array.isArray(data?.candidates) ? data.candidates : []
  const first = candidates[0]
  return {
    candidateCount: candidates.length,
    finishReason: first?.finishReason ?? null,
    blockReason: data?.promptFeedback?.blockReason ?? null,
  }
}

function describeKeywordGeminiIssue(data, extractedText) {
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

export async function generateKeywordResult({ body, key }) {
  const rawRating = Number.isFinite(Number(body.rating)) ? Number(body.rating) : 5
  const rating = Math.max(1, Math.min(5, rawRating))
  const productUrl =
    typeof body.productUrl === 'string' ? body.productUrl.trim() : ''
  let productContext =
    typeof body.productContext === 'string' ? body.productContext.trim() : ''
  let imageInput = null

  if (!productContext && productUrl) {
    const productResult = await fetchProductAnalysis(productUrl)
    if (!productResult.ok) {
      return {
        status: productResult.status,
        body: { ok: false, error: productResult.error },
      }
    }
    productContext = productResult.productContext
  }

  if (!productContext) {
    imageInput = validateImagesInput(
      body.images,
      body.imageBase64,
      body.mimeType,
    )

    if (!imageInput.ok) {
      return {
        status: imageInput.status,
        body: { ok: false, error: imageInput.error },
      }
    }
  }

  const previousKeywords = sanitizeKeywordArray(body.previousKeywords) || []
  const prompt = buildKeywordPrompt({
    rating,
    category: body.category,
    subcategory: body.subcategory,
    imageCount: imageInput?.images?.length ?? 0,
    productContext,
    minKeywordCount: KEYWORDS_MIN_COUNT,
    maxKeywordCount: KEYWORDS_MAX_COUNT,
    previousKeywords,
  })
  const imageParts = imageInput ? buildImageParts(imageInput.images) : []
  const buildKeywordPayload = (text) => ({
    contents: [
      {
        parts: [
          ...imageParts,
          { text },
        ],
      },
    ],
    generationConfig: buildKeywordGenerationConfig(),
  })

  const rejectedKeywordSets = previousKeywords.length ? [previousKeywords] : []
  const removedContainerKeywords = []
  let result = null
  let parsed = null
  let sawDuplicate = false
  let sawContainerOnlyKeyword = false

  for (let attempt = 0; attempt < KEYWORD_RETRY_LIMIT; attempt += 1) {
    const duplicateAwarePrompt =
      attempt === 0
        ? prompt
        : appendKeywordRetryGuidance(prompt, rejectedKeywordSets)
    const promptForAttempt = appendContainerKeywordRetryGuidance(
      duplicateAwarePrompt,
      removedContainerKeywords,
    )

    result = await requestGemini({
      key,
      payload: buildKeywordPayload(promptForAttempt),
    })
    if (!result.ok) {
      return { status: toClientErrorStatus(result.status), body: result }
    }

    parsed = parseKeywordsFromAny(result.data)
    if (!parsed.keywords || parsed.keywords.length < KEYWORDS_MIN_COUNT) {
      break
    }

    const filtered = filterCosmeticContainerKeywords(parsed.keywords, {
      category: body.category,
      productContext,
    })
    if (filtered.removed.length) {
      sawContainerOnlyKeyword = true
      removedContainerKeywords.push(...filtered.removed)
      rejectedKeywordSets.push(parsed.keywords)
      if (!filtered.keywords || filtered.keywords.length < KEYWORDS_MIN_COUNT) {
        parsed = {
          ...parsed,
          keywords: null,
          tooFew: true,
          partial: filtered.keywords || [],
        }
        continue
      }
      parsed = {
        ...parsed,
        keywords: filtered.keywords,
      }
    }

    const isDuplicate = rejectedKeywordSets.some((set) =>
      isSameKeywordSet(parsed.keywords, set),
    )
    if (!isDuplicate) {
      return {
        status: 200,
        body: {
          ok: true,
          keywords: parsed.keywords,
          model: result.model,
        },
      }
    }
    rejectedKeywordSets.push(parsed.keywords)
    sawDuplicate = true
    parsed = null
  }

  if (parsed?.tooFew) {
    const n = parsed.partial?.length ?? 0
    if (DEBUG_LOGS) {
      console.warn('[gemini keywords] too few after filter', {
        count: n,
        ...summarizeKeywordDebug(result.data),
      })
    }
    return {
      status: 502,
      body: {
        ok: false,
        error: `키워드가 ${n}개뿐입니다. 최소 ${KEYWORDS_MIN_COUNT}개, 권장 4~8개가 필요합니다. 다시 생성해 주세요.`,
      },
    }
  }

  if (sawDuplicate) {
    return {
      status: 502,
      body: {
        ok: false,
        error: '이전과 같은 키워드만 반복 생성되었습니다. 다시 시도해 주세요.',
      },
    }
  }

  if (sawContainerOnlyKeyword) {
    return {
      status: 502,
      body: {
        ok: false,
        error:
          '용기나 패키지 중심 키워드만 생성되었습니다. 내용물의 제형, 색감, 향, 발림성, 흡수감 중심으로 다시 생성해 주세요.',
      },
    }
  }

  const apiIssue = describeKeywordGeminiIssue(result.data, parsed?.rawText)
  if (DEBUG_LOGS) {
    console.warn('[gemini keywords] parse failed', {
      apiIssue,
      ...summarizeKeywordDebug(result.data),
    })
  }
  return {
    status: 502,
    body: {
      ok: false,
      error:
        apiIssue ??
        '키워드 형식을 읽을 수 없습니다. 키워드를 다시 생성해 주세요.',
    },
  }
}

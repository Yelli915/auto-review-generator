import {
  hasHangul,
  isLikelyKeywordPhrase,
  KEYWORD_LEN_MAX,
  KEYWORD_LEN_MIN,
  normalizeKeywordText,
} from '../../shared/keywordPhrase.js'
import {
  CONTAINER_CENTERED_KEYWORD_RE,
  CONTAINER_REVIEW_EXCEPTION_RE,
  COSMETIC_CONTEXT_RE,
  KEYWORD_RETRY_LIMIT,
  KEYWORDS_DEADLINE_MS,
  KEYWORDS_MAX_COUNT,
  KEYWORDS_MIN_COUNT,
} from './config.js'
import { normalizeReviewRating } from '../../shared/reviewOptions.js'
import { buildKeywordPrompt } from './prompts.js'
import { DEBUG_LOGS } from '../config.js'
import { buildImageParts, validateImagesInput } from './imageInput.js'
import {
  buildKeywordGenerationConfig,
  requestGemini,
  toClientErrorStatus,
} from './geminiClient.js'

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

function normalizeKeywordSet(keywords) {
  const normalized = Array.isArray(keywords)
    ? keywords.map(normalizeKeywordText).filter(Boolean)
    : []
  return sanitizeKeywordArray(normalized) || []
}

function keywordSignature(keywords) {
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

export function isCosmeticContainerOnlyKeyword(keyword) {
  if (typeof keyword !== 'string') return false
  if (!CONTAINER_CENTERED_KEYWORD_RE.test(keyword)) return false
  return !CONTAINER_REVIEW_EXCEPTION_RE.test(keyword)
}

export function filterCosmeticContainerKeywords(keywords, { category, productContext } = {}) {
  const normalized = normalizeKeywordSet(keywords)
  if (!normalized.length) return { keywords: null, removed: [] }
  // 화장품 상품일 때만 용기·패키지 중심 키워드를 거릅니다.
  const isCosmeticProduct =
    String(category || '').trim() === 'product' &&
    ((typeof productContext === 'string' && COSMETIC_CONTEXT_RE.test(productContext)) ||
      normalized.some((keyword) => COSMETIC_CONTEXT_RE.test(keyword)))
  if (!isCosmeticProduct) return { keywords: normalized, removed: [] }

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

function parseKeywordsFromAny(data) {
  const text = gatherKeywordResponseText(data)
  const keywords = parseKeywordsFromText(text)
  if (!keywords) return { keywords: null, rawText: text }
  if (keywords.length < KEYWORDS_MIN_COUNT) {
    return { keywords: null, rawText: text, tooFew: true, partial: keywords }
  }
  return { keywords: keywords.slice(0, KEYWORDS_MAX_COUNT), rawText: text }
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

const KEYWORD_PARSE_ERROR = '키워드 형식을 읽을 수 없습니다. 키워드를 다시 생성해 주세요.'
const DUPLICATE_KEYWORDS_ERROR = '이전과 같은 키워드만 반복 생성되었습니다. 다시 시도해 주세요.'
const CONTAINER_ONLY_KEYWORDS_ERROR =
  '용기나 패키지 중심 키워드만 생성되었습니다. 내용물의 제형, 색감, 향, 발림성, 흡수감 중심으로 다시 생성해 주세요.'

function tooFewKeywordsError(count) {
  return `키워드가 ${count}개뿐입니다. 최소 ${KEYWORDS_MIN_COUNT}개, 권장 4~8개가 필요합니다. 다시 생성해 주세요.`
}

export async function generateKeywordResult({ body, key }) {
  const rating = normalizeReviewRating(body.rating)
  // 상품 링크는 화면이 analyze-product로 먼저 분석해 productContext로 보냅니다.
  const productContext =
    typeof body.productContext === 'string' ? body.productContext.trim() : ''
  let imageInput = null

  if (!productContext) {
    imageInput = validateImagesInput(body.images)

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
  // 시도마다 실패 이유를 덮어써서, 끝까지 실패하면 마지막 이유를 알려 줍니다.
  let failure = ''
  // 재시도 전체가 하나의 제한 시간을 나눠 써서 함수 최대 실행 시간 전에 끝냅니다.
  const signal = AbortSignal.timeout(KEYWORDS_DEADLINE_MS)

  for (let attempt = 0; attempt < KEYWORD_RETRY_LIMIT; attempt += 1) {
    const promptForAttempt = appendContainerKeywordRetryGuidance(
      attempt === 0 ? prompt : appendKeywordRetryGuidance(prompt, rejectedKeywordSets),
      removedContainerKeywords,
    )
    const result = await requestGemini({
      key,
      payload: buildKeywordPayload(promptForAttempt),
      signal,
    })
    if (!result.ok) {
      return { status: toClientErrorStatus(result.status), body: result }
    }

    const parsed = parseKeywordsFromAny(result.data)
    if (!parsed.keywords) {
      // 형식이 깨지거나 차단된 응답은 다시 물어도 비슷하므로 바로 멈춥니다.
      failure = parsed.tooFew
        ? tooFewKeywordsError(parsed.partial.length)
        : describeKeywordGeminiIssue(result.data, parsed.rawText) ?? KEYWORD_PARSE_ERROR
      if (DEBUG_LOGS) {
        console.warn('[gemini keywords] parse failed', {
          failure,
          ...summarizeKeywordDebug(result.data),
        })
      }
      break
    }

    let keywords = parsed.keywords
    const filtered = filterCosmeticContainerKeywords(keywords, {
      category: body.category,
      productContext,
    })
    if (filtered.removed.length) {
      removedContainerKeywords.push(...filtered.removed)
      rejectedKeywordSets.push(keywords)
      keywords = filtered.keywords || []
      if (keywords.length < KEYWORDS_MIN_COUNT) {
        failure = CONTAINER_ONLY_KEYWORDS_ERROR
        continue
      }
    }

    if (rejectedKeywordSets.some((set) => isSameKeywordSet(keywords, set))) {
      rejectedKeywordSets.push(keywords)
      failure = DUPLICATE_KEYWORDS_ERROR
      continue
    }

    return {
      status: 200,
      body: { ok: true, keywords, model: result.model },
    }
  }

  return { status: 502, body: { ok: false, error: failure } }
}

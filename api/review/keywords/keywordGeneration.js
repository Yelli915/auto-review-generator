import { fetchProductAnalysis } from '../../product/fetchProductAnalysis.js'
import { buildKeywordPrompt } from '../../prompts.js'
import {
  DEBUG_LOGS,
  KEYWORD_RETRY_LIMIT,
  KEYWORDS_MAX_COUNT,
  KEYWORDS_MIN_COUNT,
} from '../config.js'
import { buildImageParts, validateImagesInput } from '../imageInput.js'
import {
  buildKeywordGenerationConfig,
  requestGemini,
  toClientErrorStatus,
} from '../providers/gemini/client.js'
import { appendKeywordRetryGuidance, isSameKeywordSet, sanitizeKeywordArray } from './keywordSets.js'
import {
  appendContainerKeywordRetryGuidance,
  filterCosmeticContainerKeywords,
} from './keywordFiltering.js'
import {
  describeKeywordGeminiIssue,
  parseKeywordsFromAny,
  summarizeKeywordDebug,
} from './keywordParsing.js'

export {
  appendKeywordRetryGuidance,
  isSameKeywordSet,
  sanitizeKeywordArray,
} from './keywordSets.js'
export {
  filterCosmeticContainerKeywords,
  isCosmeticContainerOnlyKeyword,
} from './keywordFiltering.js'
export { parseKeywordsFromText } from './keywordParsing.js'

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

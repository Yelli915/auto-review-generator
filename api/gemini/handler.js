/* global process */
import { normalizeReviewTone } from '../../shared/reviewOptions.js'
import { fetchProductAnalysis } from '../productContext.js'
import { authorizeRequest } from './auth.js'
import { getClientIp } from './clientIp.js'
import { MODEL } from './config.js'
import { json, readJsonBody } from './httpResponse.js'
import { generateKeywordResult } from './keywordGeneration.js'
import { applyDailyUsageLimit, applyRateLimit } from './rateLimit.js'
import { streamGeminiReview } from './reviewStreaming.js'

const ERRORS = {
  invalidMethod: 'Method Not Allowed',
  bodyTooLarge: '요청 본문이 너무 큽니다. 이미지 크기를 줄여 다시 시도해 주세요.',
  invalidJson: '올바르지 않은 JSON 본문입니다.',
  productUrlRequired: '상품 링크를 입력해 주세요.',
  rateStoreUnavailable:
    '요청 제한 저장소를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  usageStoreUnavailable:
    '사용량 제한 저장소를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  rateLimited: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  missingGeminiKey: '서버 환경변수 GEMINI_API_KEY가 없습니다.',
  reviewFailed: '리뷰 생성 실패',
  unsupportedAction: '지원하지 않는 action입니다.',
}

function sendError(res, status, error) {
  return json(res, status, { ok: false, error })
}

function getGeminiApiKey() {
  return typeof process.env.GEMINI_API_KEY === 'string'
    ? process.env.GEMINI_API_KEY.trim()
    : ''
}

function getRateKey(req, auth) {
  return auth.userId
    ? `user:${auth.userId}`
    : `ip:${getClientIp(req) || 'unknown'}`
}

async function rejectRateLimit(res, rateKey) {
  let rate
  try {
    rate = await applyRateLimit(rateKey)
  } catch {
    sendError(res, 503, ERRORS.rateStoreUnavailable)
    return true
  }
  if (rate.ok) return false

  res.setHeader('Retry-After', String(rate.retryAfterSec))
  sendError(res, 429, ERRORS.rateLimited)
  return true
}

async function rejectDailyUsageLimit(res, identifier, action) {
  let dailyUsage
  try {
    dailyUsage = await applyDailyUsageLimit(identifier, action)
  } catch {
    sendError(res, 503, ERRORS.usageStoreUnavailable)
    return true
  }
  if (dailyUsage.ok) return false

  res.setHeader('Retry-After', String(dailyUsage.retryAfterSec))
  sendError(
    res,
    429,
    `일일 요청 한도(${dailyUsage.limit}회)를 초과했습니다. 내일 다시 시도해 주세요.`,
  )
  return true
}

async function handleAnalyzeProduct(body, res) {
  const productUrl =
    typeof body.productUrl === 'string' ? body.productUrl.trim() : ''
  if (!productUrl) return sendError(res, 400, ERRORS.productUrlRequired)

  const analysis = await fetchProductAnalysis(productUrl)
  if (!analysis.ok) return sendError(res, analysis.status, analysis.error)

  return json(res, 200, {
    ok: true,
    url: analysis.url,
    product: analysis.product,
    productContext: analysis.productContext,
    optionGroups: analysis.optionGroups,
    analysisStatus: analysis.analysisStatus,
    warning: analysis.warning,
    needsManualInput: analysis.needsManualInput,
  })
}

async function handleKeywords(body, res, key, rateKey) {
  if (await rejectDailyUsageLimit(res, rateKey, body.action)) return
  const result = await generateKeywordResult({ body, key })
  return json(res, result.status, result.body)
}

async function handleReview(body, res, key, rateKey) {
  if (await rejectDailyUsageLimit(res, rateKey, body.action)) return
  try {
    await streamGeminiReview({
      key,
      rating: Number.isFinite(Number(body.rating)) ? Number(body.rating) : 5,
      keywords: body.keywords,
      length: body.length,
      tone: normalizeReviewTone(body.tone),
      category: body.category,
      subcategory: body.subcategory,
      productContext: body.productContext,
      previousReview: body.previousReview,
      rewriteInstruction: body.rewriteInstruction,
      res,
    })
  } catch (err) {
    return sendError(
      res,
      502,
      err instanceof Error ? err.message : ERRORS.reviewFailed,
    )
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendError(res, 405, ERRORS.invalidMethod)
  }

  const body = await readJsonBody(req)
  if (body?.tooLarge) return sendError(res, 413, ERRORS.bodyTooLarge)
  if (!body) return sendError(res, 400, ERRORS.invalidJson)
  if (body.action === 'ping') {
    return json(res, 200, { ok: true, model: MODEL })
  }

  const auth = await authorizeRequest(req)
  if (!auth.ok) return sendError(res, auth.status, auth.error)

  const rateKey = getRateKey(req, auth)
  if (await rejectRateLimit(res, rateKey)) return

  if (body.action === 'analyze-product') {
    return handleAnalyzeProduct(body, res)
  }

  const key = getGeminiApiKey()
  if (!key) return sendError(res, 500, ERRORS.missingGeminiKey)

  if (body.action === 'keywords') {
    return handleKeywords(body, res, key, rateKey)
  }
  if (body.action === 'review') {
    return handleReview(body, res, key, rateKey)
  }

  return sendError(res, 400, ERRORS.unsupportedAction)
}

import {
  prepareProductAnalysis,
  readProductAnalysis,
} from '../server/product/fetchProductAnalysis.js'
import { authorizeRequest, getClientIp } from '../server/auth.js'
import { getTrimmedEnv } from '../server/config.js'
import { json, readJsonBody } from '../server/httpResponse.js'
import { generateKeywordResult } from '../server/review/keywords.js'
import { applyDailyUsageLimit, applyRateLimit } from '../server/rateLimit.js'
import { streamGeminiReview } from '../server/review/reviewStreaming.js'

const ERRORS = {
  invalidMethod: 'Method Not Allowed',
  bodyTooLarge: '요청 본문이 너무 큽니다. 이미지 크기를 줄여 다시 시도해 주세요.',
  invalidJson: '올바르지 않은 JSON 본문입니다.',
  rateStoreUnavailable:
    '요청 제한 저장소를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  usageStoreUnavailable:
    '사용량 제한 저장소를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  rateLimited: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  productFailed: '상품 정보를 분석하지 못했습니다.',
  keywordsFailed: '키워드 생성 실패',
  missingGeminiKey: '서버 환경변수 GEMINI_API_KEY가 없습니다.',
  reviewFailed: '리뷰 생성 실패',
  unsupportedAction: '지원하지 않는 action입니다.',
}

function sendError(res, status, error) {
  return json(res, status, { ok: false, error })
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

function setReviewUsageHeaders(res, dailyUsage, count) {
  const remaining = dailyUsage.ok ? Math.max(0, dailyUsage.limit - count) : 0
  res.setHeader('X-Review-Remaining', String(remaining))
  res.setHeader('X-Review-Reset', String(dailyUsage.resetAfterSec))
}

// 한도를 차감하고 차감 결과를 돌려줍니다. 한도 초과나 저장소 오류면 응답을 보내고 null을 돌려줍니다.
async function chargeDailyUsage(res, identifier, action) {
  let dailyUsage
  try {
    dailyUsage = await applyDailyUsageLimit(identifier, action)
  } catch {
    sendError(res, 503, ERRORS.usageStoreUnavailable)
    return null
  }
  // 리뷰 생성·다듬기만 화면에 남은 횟수를 보여 주므로 review 응답에만 붙입니다. 한도 초과(429)면 0입니다.
  if (action === 'review' && dailyUsage.limit) {
    setReviewUsageHeaders(res, dailyUsage, dailyUsage.count)
  }
  if (dailyUsage.ok) return dailyUsage

  res.setHeader('Retry-After', String(dailyUsage.retryAfterSec))
  sendError(
    res,
    429,
    `일일 요청 한도(${dailyUsage.limit}회)를 초과했습니다. 내일 다시 시도해 주세요.`,
  )
  return null
}

// 결과를 하나도 받지 못한 실패만 되돌립니다. 환불 실패는 무시하고 차감된 채로 둡니다.
async function refundDailyUsage(dailyUsage) {
  try {
    const count = await dailyUsage.refund?.()
    return Number.isFinite(count) ? count : null
  } catch {
    return null
  }
}

async function handleAnalyzeProduct(body, res, rateKey) {
  const prepared = await prepareProductAnalysis(body.productUrl)
  if (!prepared.ok) return sendError(res, prepared.status, prepared.error)
  if (prepared.cached) return json(res, 200, prepared.cached)

  // 빈 링크·잘못된 URL·캐시 적중은 한도를 쓰지 않도록 실제로 페이지를 읽기 직전에만 차감합니다.
  const dailyUsage = await chargeDailyUsage(res, rateKey, body.action)
  if (!dailyUsage) return
  let analysis
  try {
    analysis = await readProductAnalysis(prepared.url)
  } catch {
    analysis = { ok: false, status: 502, error: ERRORS.productFailed }
  }
  if (!analysis.ok) {
    await refundDailyUsage(dailyUsage)
    return sendError(res, analysis.status, analysis.error)
  }

  return json(res, 200, analysis)
}

async function handleKeywords(body, res, key, rateKey) {
  const dailyUsage = await chargeDailyUsage(res, rateKey, body.action)
  if (!dailyUsage) return
  let result
  try {
    result = await generateKeywordResult({ body, key })
  } catch {
    result = { status: 502, body: { ok: false, error: ERRORS.keywordsFailed } }
  }
  if (result.status !== 200) await refundDailyUsage(dailyUsage)
  return json(res, result.status, result.body)
}

async function handleReview(body, res, key, rateKey) {
  const dailyUsage = await chargeDailyUsage(res, rateKey, body.action)
  if (!dailyUsage) return
  // 스트리밍 중 실패(잘림·분량 미달·읽기 오류)나 첫 글자 전 연결 끊김은 화면이 초안을 버리므로 되돌립니다.
  // 돌려준 남은 횟수는 스트림의 error 줄에 실어 화면이 바로 고치게 합니다.
  const refund = async () => {
    const count = await refundDailyUsage(dailyUsage)
    return count !== null && dailyUsage.limit ? Math.max(0, dailyUsage.limit - count) : null
  }
  try {
    await streamGeminiReview({ key, input: body, res, refund })
  } catch (err) {
    // 스트리밍 전에 실패해 글을 받지 못했으므로 되돌립니다.
    const count = await refundDailyUsage(dailyUsage)
    if (count !== null && dailyUsage.limit) setReviewUsageHeaders(res, dailyUsage, count)
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

  const auth = await authorizeRequest(req)
  if (!auth.ok) return sendError(res, auth.status, auth.error)

  const rateKey = getRateKey(req, auth)
  if (await rejectRateLimit(res, rateKey)) return

  if (body.action === 'analyze-product') {
    return handleAnalyzeProduct(body, res, rateKey)
  }

  const key = getTrimmedEnv('GEMINI_API_KEY')
  if (!key) return sendError(res, 500, ERRORS.missingGeminiKey)

  if (body.action === 'keywords') {
    return handleKeywords(body, res, key, rateKey)
  }
  if (body.action === 'review') {
    return handleReview(body, res, key, rateKey)
  }

  return sendError(res, 400, ERRORS.unsupportedAction)
}

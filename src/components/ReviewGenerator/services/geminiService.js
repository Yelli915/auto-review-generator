import {
  createJsonHeaders,
  pickErrorMessage,
  readJsonSafely,
} from '#shared/httpJson'
import {
  normalizeReviewLength,
  normalizeReviewTone,
} from '#shared/reviewOptions'
import { createReviewStreamAccumulator } from './reviewStream.js'

const API_PATH = '/api/gemini'

let googleIdToken = ''
let onUnauthorized = null

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function setGoogleIdToken(token) {
  googleIdToken = normalizeString(token)
}

export function hasGoogleIdToken() {
  return Boolean(googleIdToken)
}

export function setUnauthorizedHandler(handler) {
  onUnauthorized = typeof handler === 'function' ? handler : null
}

function buildAuthHeaders() {
  return googleIdToken ? { Authorization: `Bearer ${googleIdToken}` } : {}
}

async function post(payload) {
  const response = await fetch(API_PATH, {
    method: 'POST',
    headers: createJsonHeaders(buildAuthHeaders()),
    body: JSON.stringify(payload),
  })
  if (response.status === 401) onUnauthorized?.()
  return response
}

async function callApi(payload) {
  try {
    const response = await post(payload)
    const data = await readJsonSafely(response)

    if (!response.ok) {
      return {
        ok: false,
        error: pickErrorMessage(data, `요청 실패 (HTTP ${response.status})`),
        status: response.status,
      }
    }
    return data
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : '네트워크 또는 알 수 없는 오류',
    }
  }
}

export async function analyzeProductUrl(productUrl) {
  const safeProductUrl = normalizeString(productUrl)
  if (!safeProductUrl) {
    return { ok: false, error: '상품 링크를 입력해 주세요.' }
  }
  return callApi({
    action: 'analyze-product',
    productUrl: safeProductUrl,
  })
}

export async function generateKeywords({
  images,
  productUrl,
  productContext,
  rating,
  category,
  subcategory,
  previousKeywords = [],
}) {
  const safeImages = Array.isArray(images)
    ? images
        .filter((image) => image?.base64Image)
        .map((image) => ({
          imageBase64: image.base64Image,
          mimeType: image.mimeType || 'image/jpeg',
        }))
    : []
  const safeProductUrl = normalizeString(productUrl)
  const safeProductContext = normalizeString(productContext)

  if (!safeImages.length && !safeProductUrl && !safeProductContext) {
    return { ok: false, error: '이미지나 상품 링크를 1개 이상 선택해 주세요.' }
  }

  // 중복 요청은 화면의 busy 상태와 서버 요청 제한이 막습니다.
  return callApi({
    action: 'keywords',
    images: safeImages,
    productUrl: safeProductUrl,
    productContext: safeProductContext,
    rating,
    category,
    subcategory,
    previousKeywords: Array.isArray(previousKeywords) ? previousKeywords : [],
  })
}

export async function generateReview({
  rating,
  keywords,
  length,
  tone,
  category,
  subcategory,
  productContext,
  previousReview,
  rewriteInstruction,
  onChunk,
}) {
  const safeKeywords = Array.isArray(keywords) ? keywords : []
  const safeLength = normalizeReviewLength(length)
  const safeTone = normalizeReviewTone(tone)
  const safeProductContext = normalizeString(productContext)
  const safePreviousReview = normalizeString(previousReview)
  const safeRewriteInstruction = normalizeString(rewriteInstruction)

  const response = await post({
    action: 'review',
    rating,
    keywords: safeKeywords,
    length: safeLength,
    tone: safeTone,
    category,
    subcategory,
    productContext: safeProductContext,
    previousReview: safePreviousReview,
    rewriteInstruction: safeRewriteInstruction,
  })

  if (!response.ok) {
    const error = await readJsonSafely(response)
    throw new Error(pickErrorMessage(error, '리뷰 생성 실패') || '리뷰 생성 실패')
  }

  if (!response.body) {
    throw new Error('스트리밍 응답을 읽을 수 없습니다.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const stream = createReviewStreamAccumulator(onChunk)
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      stream.appendLine(line)
    }
  }

  if (buffer.trim()) {
    stream.appendLine(buffer)
  }

  // 잘림·최소 글자수 검사는 서버(reviewStreaming)가 하고, 실패하면 스트림에 error로 보냅니다.
  const streamError = stream.getError()
  if (streamError) {
    throw new Error(streamError)
  }

  // 오늘 남은 리뷰 생성 횟수. 한도가 없는 환경이면 null입니다.
  const remaining = response.headers.get('X-Daily-Remaining')
  return { remaining: remaining === null ? null : Number(remaining) }
}

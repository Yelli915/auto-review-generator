import {
  createJsonHeaders,
  pickErrorMessage,
  readJsonSafely,
} from '#shared/httpJson'
import {
  normalizeReviewLength,
  normalizeReviewTone,
} from '#shared/reviewOptions'
import { readLines } from '#shared/streamLines'

const API_PATH = '/api/gemini'

export function createReviewStreamAccumulator(onChunk) {
  const safeOnChunk = typeof onChunk === 'function' ? onChunk : () => {}
  let fullText = ''
  let done = false
  let streamError = ''
  let refundedRemaining = null

  return {
    getError() {
      return streamError
    },
    isComplete() {
      return done && !streamError && Boolean(fullText.trim())
    },
    // 서버가 실패한 생성을 환불했으면 error 줄에 새 남은 횟수를 실어 보냅니다.
    getRefundedRemaining() {
      return refundedRemaining
    },
    appendLine(line) {
      if (!line.trim()) return
      let event
      try {
        event = JSON.parse(line)
      } catch {
        return
      }

      const error = normalizeString(event?.error)
      if (error) {
        streamError = error
        if (Number.isFinite(event.remaining)) refundedRemaining = event.remaining
      } else if (event?.done === true) {
        done = true
      } else if (!done && !streamError && typeof event?.text === 'string' && event.text) {
        fullText += event.text
        safeOnChunk(fullText)
      }
    },
  }
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

async function post(payload) {
  return fetch(API_PATH, {
    method: 'POST',
    headers: createJsonHeaders(),
    body: JSON.stringify(payload),
  })
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
  const safeProductContext = normalizeString(productContext)

  if (!safeImages.length && !safeProductContext) {
    return { ok: false, error: '이미지나 상품 링크를 1개 이상 선택해 주세요.' }
  }

  // 중복 요청은 화면의 busy 상태와 서버 요청 제한이 막습니다.
  return callApi({
    action: 'keywords',
    images: safeImages,
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
  onUsage,
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

  // 서버는 스트리밍 전에 횟수를 차감하므로, 생성이 실패하거나 한도 초과(429)여도 남은 횟수를 먼저 알립니다.
  const remaining = response.headers.get('X-Review-Remaining')
  const resetAt = Date.now() + Number(response.headers.get('X-Review-Reset')) * 1000
  if (remaining !== null) {
    onUsage?.({ remaining: Number(remaining), resetAt })
  }

  if (!response.ok) {
    const error = await readJsonSafely(response)
    throw new Error(pickErrorMessage(error, '리뷰 생성 실패'))
  }

  if (!response.body) {
    throw new Error('스트리밍 응답을 읽을 수 없습니다.')
  }

  const stream = createReviewStreamAccumulator(onChunk)
  for await (const line of readLines(response.body)) {
    stream.appendLine(line)
  }

  // 잘림·최소 글자수 검사는 서버(reviewStreaming)가 하고, 실패하면 스트림에 error로 보냅니다.
  const streamError = stream.getError()
  if (streamError) {
    const refunded = stream.getRefundedRemaining()
    if (refunded !== null && remaining !== null) onUsage?.({ remaining: refunded, resetAt })
    throw new Error(streamError)
  }
  if (!stream.isComplete()) {
    throw new Error('리뷰 작성이 완료되기 전에 연결이 끝났습니다. 다시 생성해 주세요.')
  }
}

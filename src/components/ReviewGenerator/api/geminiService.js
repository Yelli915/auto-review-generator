import {
  createJsonHeaders,
  pickErrorMessage,
  readJsonSafely,
} from '../../../../shared/httpJson.js'
import {
  getReviewMinChars,
  normalizeReviewLength,
  normalizeReviewTone,
} from '../../../../shared/reviewOptions.js'
const API_PATH = '/api/gemini'
const KEYWORD_DEBOUNCE_MS = 900
let googleIdToken = ''
let onUnauthorized = null

let inFlightKeywordKey = null
let inFlightKeywordPromise = null
let lastKeywordAt = 0

export function setGoogleIdToken(token) {
  googleIdToken = typeof token === 'string' ? token.trim() : ''
}

export function setUnauthorizedHandler(handler) {
  onUnauthorized = typeof handler === 'function' ? handler : null
}

function buildAuthHeaders() {
  return googleIdToken ? { Authorization: `Bearer ${googleIdToken}` } : {}
}

async function callApi(payload) {
  try {
    const response = await fetch(API_PATH, {
      method: 'POST',
      headers: createJsonHeaders(buildAuthHeaders()),
      body: JSON.stringify(payload),
    })
    const data = await readJsonSafely(response)

    if (!response.ok) {
      if (response.status === 401 && onUnauthorized) {
        onUnauthorized()
      }
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

export async function generateKeywords({
  images,
  rating,
  category,
}) {
  const safeImages = Array.isArray(images)
    ? images
        .filter((image) => image?.base64Image)
        .map((image) => ({
          imageBase64: image.base64Image,
          mimeType: image.mimeType || 'image/jpeg',
        }))
    : []
  if (!safeImages.length) {
    return { ok: false, error: '이미지를 1장 이상 선택해 주세요.' }
  }
  const payload = {
    action: 'keywords',
    images: safeImages,
    rating,
    category,
  }
  const requestKey = JSON.stringify(payload)
  const now = Date.now()

  if (inFlightKeywordPromise && inFlightKeywordKey === requestKey) {
    return inFlightKeywordPromise
  }
  if (now - lastKeywordAt < KEYWORD_DEBOUNCE_MS) {
    return {
      ok: false,
      error: '요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.',
    }
  }

  inFlightKeywordKey = requestKey
  lastKeywordAt = now
  inFlightKeywordPromise = callApi(payload).finally(() => {
    inFlightKeywordKey = null
    inFlightKeywordPromise = null
  })

  return inFlightKeywordPromise
}

export async function generateReview({
  rating,
  keywords,
  length,
  tone,
  category,
  onChunk,
}) {
  const safeKeywords = Array.isArray(keywords) ? keywords : []
  const safeLength = normalizeReviewLength(length)
  const safeTone = normalizeReviewTone(tone)
  const safeOnChunk = typeof onChunk === 'function' ? onChunk : () => {}

  const response = await fetch(API_PATH, {
    method: 'POST',
    headers: createJsonHeaders(buildAuthHeaders()),
    body: JSON.stringify({
      action: 'review',
      rating,
      keywords: safeKeywords,
      length: safeLength,
      tone: safeTone,
      category,
    }),
  })

  if (!response.ok) {
    const error = await readJsonSafely(response)
    const msg = pickErrorMessage(error, '리뷰 생성 실패')
    if (response.status === 401 && onUnauthorized) {
      onUnauthorized()
    }
    throw new Error(msg || '리뷰 생성 실패')
  }

  if (!response.body) {
    throw new Error('스트리밍 응답을 읽을 수 없습니다.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''
  let streamError = ''

  const handleJsonLine = (line) => {
    const payload = line.trim()
    if (!payload) return
    try {
      const json = JSON.parse(payload)
      const text = json?.text
      if (typeof json?.error === 'string' && json.error.trim()) {
        streamError = json.error.trim()
        return
      }
      if (text) {
        fullText += text
        safeOnChunk(fullText)
      }
    } catch {
      void 0
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      handleJsonLine(line)
    }
  }

  if (buffer.trim()) {
    handleJsonLine(buffer)
  }

  const normalizedReview = fullText.replace(/\s+/g, ' ').trim()
  if (streamError) {
    throw new Error(streamError)
  }
  if (normalizedReview.length < getReviewMinChars(safeLength)) {
    throw new Error('리뷰가 너무 짧게 생성되었습니다. 다시 생성해 주세요.')
  }
}

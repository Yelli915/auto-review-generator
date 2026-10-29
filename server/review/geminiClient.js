import { createJsonHeaders, readJsonSafely } from '../../shared/httpJson.js'
import {
  KEYWORDS_MAX_COUNT,
  KEYWORDS_MAX_OUTPUT_TOKENS,
  KEYWORDS_MIN_COUNT,
  MAX_RETRIES,
  MODEL,
  RETRYABLE_STATUS,
  REVIEW_MAX_OUTPUT_TOKENS,
} from './config.js'

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const MODEL_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}`
const GENERATE_URL = `${MODEL_URL}:generateContent`
export const STREAM_GENERATE_URL = `${MODEL_URL}:streamGenerateContent?alt=sse`

function parseGeminiRetryAfterSeconds(message) {
  if (typeof message !== 'string') return null
  const m = message.match(/retry in ([\d.]+)\s*s/i)
  if (!m) return null
  const sec = Math.ceil(Number.parseFloat(m[1]))
  return Number.isFinite(sec) && sec > 0 ? sec : null
}

function isTemporaryHighDemandMessage(message) {
  if (typeof message !== 'string') return false
  return /currently experiencing high demand|spikes in demand are usually temporary|please try again later/i.test(
    message,
  )
}

export function humanizeGeminiApiError(status, rawMessage) {
  const msg = typeof rawMessage === 'string' ? rawMessage : ''
  if (isTemporaryHighDemandMessage(msg)) {
    return '현재 모델 요청이 몰려 일시적으로 처리가 지연 중입니다. 잠시 후 다시 시도해 주세요.'
  }
  if (RETRYABLE_STATUS.has(status)) {
    return 'Gemini API 응답이 일시적으로 불안정합니다. 잠시 후 다시 시도해 주세요.'
  }
  const quotaLike =
    status === 429 ||
    /quota exceeded|resource_exhausted|free_tier|rate.?limit|exceeded your current quota/i.test(
      msg,
    )
  if (!quotaLike) {
    return msg || `요청 실패 (HTTP ${status})`
  }
  const waitSec = parseGeminiRetryAfterSeconds(msg)
  const waitHint =
    waitSec != null ? ` 약 ${waitSec}초 후에 다시 시도해 보세요.` : ''
  return (
    `Gemini API 호출 한도에 걸렸습니다.${waitHint} ` +
    `Google AI Studio에서 API 키의 결제/플랜 연결 상태와 프로젝트 설정을 확인하세요. ` +
    `https://ai.google.dev/gemini-api/docs/rate-limits · https://ai.dev/rate-limit`
  )
}

export function buildKeywordGenerationConfig() {
  return {
    temperature: 0.1,
    maxOutputTokens: KEYWORDS_MAX_OUTPUT_TOKENS,
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'object',
      properties: {
        keywords: {
          type: 'array',
          items: { type: 'string' },
          minItems: KEYWORDS_MIN_COUNT,
          maxItems: KEYWORDS_MAX_COUNT,
        },
      },
      required: ['keywords'],
    },
    thinkingConfig: {
      thinkingBudget: 0,
    },
  }
}

export function buildReviewGenerationConfig(length) {
  return {
    temperature: 0.6,
    maxOutputTokens: REVIEW_MAX_OUTPUT_TOKENS[length] ?? REVIEW_MAX_OUTPUT_TOKENS.medium,
    thinkingConfig: {
      thinkingBudget: 0,
    },
  }
}

// Gemini SSE의 "data: ..." 한 줄을 { text, finishReason }으로 바꿉니다. 해석할 수 없는 줄은 null입니다.
// 서버 스트리밍(reviewStreaming.js)과 eval이 같이 씁니다.
export function parseGeminiSseLine(line) {
  if (!line.startsWith('data: ')) return null
  const payload = line.slice(6).trim()
  if (!payload || payload === '[DONE]') return null
  try {
    const candidate = JSON.parse(payload)?.candidates?.[0]
    return {
      text: candidate?.content?.parts?.[0]?.text || '',
      finishReason: candidate?.finishReason ?? null,
    }
  } catch {
    return null
  }
}

export async function requestGemini({ key, payload, signal }) {
  let lastError = null
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(GENERATE_URL, {
        method: 'POST',
        headers: createJsonHeaders({ 'x-goog-api-key': key }),
        body: JSON.stringify(payload),
        signal,
      })
      const data = await readJsonSafely(response)
      if (response.ok) return { ok: true, data, model: MODEL }

      const rawMessage =
        data?.error?.message ?? `요청 실패 (HTTP ${response.status})`
      const message = humanizeGeminiApiError(response.status, rawMessage)
      if (response.status === 429) {
        const highDemand = isTemporaryHighDemandMessage(rawMessage)
        if (highDemand && attempt < MAX_RETRIES) {
          const retryAfterSec = parseGeminiRetryAfterSeconds(rawMessage) ?? 2
          await wait(Math.min(6000, retryAfterSec * 1000))
          continue
        }
        return { ok: false, error: message, status: response.status }
      }
      if (!RETRYABLE_STATUS.has(response.status) || attempt === MAX_RETRIES) {
        return { ok: false, error: message, status: response.status }
      }
      await wait(700 * 2 ** attempt)
    } catch (err) {
      lastError = err
      if (signal?.aborted || attempt === MAX_RETRIES) break
      await wait(700 * 2 ** attempt)
    }
  }
  if (signal?.aborted) {
    return { ok: false, error: 'Gemini 응답 시간이 초과되었습니다. 다시 시도해 주세요.' }
  }
  const message =
    lastError instanceof Error ? lastError.message : '네트워크 또는 알 수 없는 오류'
  return { ok: false, error: message }
}

export function toClientErrorStatus(status) {
  if (!Number.isInteger(status)) return 502
  if (RETRYABLE_STATUS.has(status)) return 502
  if (status >= 400 && status <= 599) return status
  return 502
}

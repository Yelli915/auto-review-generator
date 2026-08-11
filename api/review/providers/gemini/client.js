import { createJsonHeaders, readJsonSafely } from '../../../../shared/httpJson.js'
import { KEYWORDS_MAX_COUNT, KEYWORDS_MIN_COUNT } from '../../config.js'
import {
  KEYWORDS_MAX_OUTPUT_TOKENS,
  MAX_RETRIES,
  MODEL,
  RETRYABLE_STATUS,
  REVIEW_MAX_OUTPUT_TOKENS,
} from './config.js'

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function makeUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
}

export function makeStreamUrl(model = MODEL) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`
}

export function parseGeminiRetryAfterSeconds(message) {
  if (typeof message !== 'string') return null
  const m = message.match(/retry in ([\d.]+)\s*s/i)
  if (!m) return null
  const sec = Math.ceil(Number.parseFloat(m[1]))
  return Number.isFinite(sec) && sec > 0 ? sec : null
}

export function isTemporaryHighDemandMessage(message) {
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
    return 'Gemini API 응답이 일시적으로 불안정합니다. 잠시 후 다시 키워드를 생성해 주세요.'
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

export async function requestGemini({ key, payload, maxRetries = MAX_RETRIES }) {
  let lastError = null
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetch(makeUrl(MODEL), {
        method: 'POST',
        headers: createJsonHeaders({ 'x-goog-api-key': key }),
        body: JSON.stringify(payload),
      })
      const data = await readJsonSafely(response)
      if (response.ok) return { ok: true, data, model: MODEL }

      const rawMessage =
        data?.error?.message ?? `요청 실패 (HTTP ${response.status})`
      const message = humanizeGeminiApiError(response.status, rawMessage)
      if (response.status === 429) {
        const highDemand = isTemporaryHighDemandMessage(rawMessage)
        if (highDemand && attempt < maxRetries) {
          const retryAfterSec = parseGeminiRetryAfterSeconds(rawMessage) ?? 2
          await wait(Math.min(6000, retryAfterSec * 1000))
          continue
        }
        return { ok: false, error: message, status: response.status }
      }
      if (!RETRYABLE_STATUS.has(response.status) || attempt === maxRetries) {
        return { ok: false, error: message, status: response.status }
      }
      await wait(700 * 2 ** attempt)
    } catch (err) {
      lastError = err
      if (attempt === maxRetries) break
      await wait(700 * 2 ** attempt)
    }
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

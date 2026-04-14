const API_PATH = '/api/gemini'
const KEYWORD_DEBOUNCE_MS = 900
const DAILY_LIMIT = 20
const DAILY_USAGE_KEY = 'autoReviewGeminiDailyUsage'
let googleIdToken = ''
let onUnauthorized = null

let inFlightKeywordKey = null
let inFlightKeywordPromise = null
let lastKeywordAt = 0

const lengthMap = {
  short: '2~3문장 이내로 간결하게',
  medium: '4~5문장 분량으로',
  long: '7~8문장의 상세한 내용으로',
}

const validTones = new Set(['neutral', 'friendly', 'formal', 'casual'])

export function setGoogleIdToken(token) {
  googleIdToken = typeof token === 'string' ? token.trim() : ''
}

export function setUnauthorizedHandler(handler) {
  onUnauthorized = typeof handler === 'function' ? handler : null
}

function buildAuthHeaders() {
  return googleIdToken ? { Authorization: `Bearer ${googleIdToken}` } : {}
}

function getLocalDayKey() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function consumeDailyQuota(action, { commit = false } = {}) {
  if (action === 'ping' || typeof window === 'undefined') {
    return { ok: true }
  }
  try {
    const today = getLocalDayKey()
    const raw = window.localStorage.getItem(DAILY_USAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    const base =
      parsed && typeof parsed === 'object'
        ? parsed
        : { dayKey: today, count: 0 }
    const count = base.dayKey === today ? Number(base.count) || 0 : 0
    if (count >= DAILY_LIMIT) {
      return {
        ok: false,
        error: `일일 요청 한도(${DAILY_LIMIT}회)를 초과했습니다. 내일 다시 시도해 주세요.`,
      }
    }
    if (commit) {
      window.localStorage.setItem(
        DAILY_USAGE_KEY,
        JSON.stringify({ dayKey: today, count: count + 1 }),
      )
    }
    return { ok: true }
  } catch {
    return { ok: true }
  }
}

async function callApi(payload) {
  const quota = consumeDailyQuota(payload?.action)
  if (!quota.ok) return quota
  try {
    const response = await fetch(API_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(),
      },
      body: JSON.stringify(payload),
    })
    let data = {}
    try {
      data = await response.json()
    } catch {
      data = {}
    }

    if (!response.ok) {
      if (response.status === 401 && onUnauthorized) {
        onUnauthorized()
      }
      return {
        ok: false,
        error: data?.error ?? `요청 실패 (HTTP ${response.status})`,
        status: response.status,
        details: data,
      }
    }
    const quotaCommit = consumeDailyQuota(payload?.action, { commit: true })
    if (!quotaCommit.ok) return quotaCommit
    return data
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : '네트워크 또는 알 수 없는 오류',
    }
  }
}

export async function pingGemini() {
  return callApi({ action: 'ping' })
}

export async function generateKeywords({
  imageBase64,
  rating,
  mimeType = 'image/jpeg',
}) {
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return { ok: false, error: 'imageBase64가 필요합니다.' }
  }
  const payload = {
    action: 'keywords',
    imageBase64,
    rating,
    mimeType,
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

export async function generateReview(
  rating,
  keywords,
  length,
  tone,
  onChunk,
) {
  const quota = consumeDailyQuota('review')
  if (!quota.ok) throw new Error(quota.error)

  const safeKeywords = Array.isArray(keywords) ? keywords : []
  const safeLength = lengthMap[length] ? length : 'medium'
  const safeTone = validTones.has(tone) ? tone : 'neutral'
  const safeOnChunk = typeof onChunk === 'function' ? onChunk : () => {}

  const response = await fetch(API_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(),
    },
    body: JSON.stringify({
      action: 'review',
      rating,
      keywords: safeKeywords,
      length: safeLength,
      tone: safeTone,
    }),
  })

  if (!response.ok) {
    let error = {}
    try {
      error = await response.json()
    } catch {
      error = {}
    }
    const msg = typeof error?.error === 'string' ? error.error : error?.error?.message
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

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const payload = line.trim()
      if (!payload) continue
      try {
        const json = JSON.parse(payload)
        const text = json?.text
        if (text) safeOnChunk(text)
      } catch {
        // 불완전한 청크 무시
      }
    }
  }

  if (buffer.trim()) {
    try {
      const json = JSON.parse(buffer.trim())
      const text = json?.text
      if (text) safeOnChunk(text)
    } catch {
      // 불완전한 청크 무시
    }
  }

  const quotaCommit = consumeDailyQuota('review', { commit: true })
  if (!quotaCommit.ok) {
    throw new Error(quotaCommit.error)
  }
}

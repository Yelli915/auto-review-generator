const API_PATH = '/api/gemini'

const lengthMap = {
  short: '2~3문장 이내로 간결하게',
  medium: '4~5문장 분량으로',
  long: '7~8문장의 상세한 내용으로',
}

async function callApi(payload) {
  try {
    const response = await fetch(API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    let data = {}
    try {
      data = await response.json()
    } catch {
      data = {}
    }

    if (!response.ok) {
      return {
        ok: false,
        error: data?.error ?? `요청 실패 (HTTP ${response.status})`,
        status: response.status,
        details: data,
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
  return callApi({
    action: 'keywords',
    imageBase64,
    rating,
    mimeType,
  })
}

export async function generateReview(
  base64Image,
  rating,
  keywords,
  length,
  onChunk,
) {
  if (!base64Image || typeof base64Image !== 'string') {
    throw new Error('base64Image가 필요합니다.')
  }

  const safeKeywords = Array.isArray(keywords) ? keywords : []
  const safeLength = lengthMap[length] ? length : 'medium'
  const safeOnChunk = typeof onChunk === 'function' ? onChunk : () => {}

  const response = await fetch(API_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'review',
      imageBase64: base64Image,
      rating,
      keywords: safeKeywords,
      length: safeLength,
      mimeType: 'image/jpeg',
    }),
  })

  if (!response.ok) {
    let error = {}
    try {
      error = await response.json()
    } catch {
      error = {}
    }
    throw new Error(error?.error?.message || '리뷰 생성 실패')
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
}

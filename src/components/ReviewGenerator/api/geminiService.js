const API_PATH = '/api/gemini'

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

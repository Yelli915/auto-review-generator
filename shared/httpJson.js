export function createJsonHeaders(extraHeaders = {}) {
  return {
    'Content-Type': 'application/json',
    ...extraHeaders,
  }
}

export async function readJsonSafely(response) {
  try {
    const data = await response.json()
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

export function pickErrorMessage(data, fallbackMessage) {
  if (typeof data?.error === 'string' && data.error.trim()) {
    return data.error
  }
  if (typeof data?.error?.message === 'string' && data.error.message.trim()) {
    return data.error.message
  }
  return fallbackMessage
}

const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash']
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const MAX_RETRIES = 3

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function makeUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
}

function parseKeywordsFromText(text) {
  if (typeof text !== 'string' || !text.trim()) return null

  const raw = text.trim()
  const normalized = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')

  function sanitizeKeywords(arr) {
    if (!Array.isArray(arr)) return null
    const cleaned = arr
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean)
    return cleaned.length ? Array.from(new Set(cleaned)) : null
  }

  try {
    const parsed = JSON.parse(normalized)
    const fromObject = sanitizeKeywords(parsed?.keywords)
    if (fromObject) return fromObject
    const fromArray = sanitizeKeywords(parsed)
    if (fromArray) return fromArray
  } catch {}

  const objBlock = normalized.match(/\{[\s\S]*\}/)
  if (objBlock) {
    try {
      const parsed = JSON.parse(objBlock[0])
      const fromObject = sanitizeKeywords(parsed?.keywords)
      if (fromObject) return fromObject
    } catch {}
  }

  const arrayBlock = normalized.match(/\[[\s\S]*\]/)
  if (arrayBlock) {
    try {
      const parsed = JSON.parse(arrayBlock[0])
      const fromArray = sanitizeKeywords(parsed)
      if (fromArray) return fromArray
    } catch {}
  }

  const lines = normalized
    .split('\n')
    .map((line) => line.replace(/^[\s\-*0-9.]+/, '').trim())
    .filter(Boolean)
  const fromLines = sanitizeKeywords(lines)
  if (fromLines) return fromLines

  const keywordArrayHint = normalized.match(/"keywords"\s*:\s*\[([\s\S]*)$/i)
  if (keywordArrayHint) {
    const candidates = Array.from(
      keywordArrayHint[1].matchAll(/"([^"\n]{1,40})"/g),
    ).map((m) => m[1])
    const fromHint = sanitizeKeywords(candidates)
    if (fromHint) return fromHint
  }

  return null
}

async function requestGemini({ key, payload }) {
  let lastError = null

  for (const model of MODELS) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const response = await fetch(makeUrl(model), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key,
          },
          body: JSON.stringify(payload),
        })

        let data = {}
        try {
          data = await response.json()
        } catch {
          data = {}
        }

        if (response.ok) return { ok: true, data, model }

        const message =
          data?.error?.message ?? `요청 실패 (HTTP ${response.status})`

        if (!RETRYABLE_STATUS.has(response.status) || attempt === MAX_RETRIES) {
          if (model === MODELS[MODELS.length - 1]) {
            return {
              ok: false,
              error: message,
              status: response.status,
              details: data,
            }
          }
          break
        }

        await wait(700 * 2 ** attempt)
      } catch (err) {
        lastError = err
        if (attempt === MAX_RETRIES) break
        await wait(700 * 2 ** attempt)
      }
    }
  }

  const message =
    lastError instanceof Error
      ? lastError.message
      : '네트워크 또는 알 수 없는 오류'
  return { ok: false, error: message }
}

function json(res, code, body) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'Method Not Allowed' })
  }

  const key =
    typeof process.env.GEMINI_API_KEY === 'string'
      ? process.env.GEMINI_API_KEY.trim()
      : ''
  if (!key) {
    return json(res, 500, {
      ok: false,
      error: '서버 환경변수 GEMINI_API_KEY가 없습니다.',
    })
  }

  const body = await readJsonBody(req)
  if (!body) {
    return json(res, 400, { ok: false, error: '잘못된 JSON 본문입니다.' })
  }

  if (body.action === 'ping') {
    const result = await requestGemini({
      key,
      payload: { contents: [{ parts: [{ text: 'hello' }] }] },
    })
    return json(res, result.ok ? 200 : 502, result)
  }

  if (body.action === 'keywords') {
    const imageBase64 = body.imageBase64
    const rating = Number.isFinite(Number(body.rating)) ? Number(body.rating) : 5
    const mimeType =
      typeof body.mimeType === 'string' && body.mimeType
        ? body.mimeType
        : 'image/jpeg'

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return json(res, 400, { ok: false, error: 'imageBase64가 필요합니다.' })
    }

    const prompt = `별점 ${rating}점 기준 키워드 8개를 JSON으로만 반환해줘. 설명 문장, 마크다운, 코드블록 없이 정확히 아래 형식만 응답해: {"keywords":["키워드1","키워드2","키워드3","키워드4","키워드5","키워드6","키워드7","키워드8"]}`
    const result = await requestGemini({
      key,
      payload: {
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: mimeType,
                  data: imageBase64,
                },
              },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 512,
        },
      },
    })

    if (!result.ok) return json(res, 502, result)

    const parts = result.data?.candidates?.[0]?.content?.parts ?? []
    const text = parts
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('\n')
      .trim()
    const keywords = parseKeywordsFromText(text)
    if (!keywords || keywords.length < 8) {
      return json(res, 502, {
        ok: false,
        error: '키워드 파싱 실패',
        rawText: text,
      })
    }

    return json(res, 200, {
      ok: true,
      keywords: keywords.slice(0, 8),
      model: result.model,
    })
  }

  return json(res, 400, { ok: false, error: '지원하지 않는 action입니다.' })
}

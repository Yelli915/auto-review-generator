/* global Buffer, process */
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash']
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const MAX_RETRIES = 2
const STREAM_MODEL = 'gemini-2.0-flash'

const REVIEW_LENGTH_MAP = {
  short: '2~3문장 이내로 간결하게',
  medium: '4~5문장 분량으로',
  long: '7~8문장의 상세한 내용으로',
}

const MAX_OUTPUT_TOKENS = {
  short: 150,
  medium: 280,
  long: 450,
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function makeUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
}

function makeStreamUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`
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
  } catch {
    void 0
  }

  const objBlock = normalized.match(/\{[\s\S]*\}/)
  if (objBlock) {
    try {
      const parsed = JSON.parse(objBlock[0])
      const fromObject = sanitizeKeywords(parsed?.keywords)
      if (fromObject) return fromObject
    } catch {
      void 0
    }
  }

  const arrayBlock = normalized.match(/\[[\s\S]*\]/)
  if (arrayBlock) {
    try {
      const parsed = JSON.parse(arrayBlock[0])
      const fromArray = sanitizeKeywords(parsed)
      if (fromArray) return fromArray
    } catch {
      void 0
    }
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

function parseKeywordsFromAny(data) {
  const parts = data?.candidates?.[0]?.content?.parts ?? []
  const text = parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('\n')
    .trim()

  const direct = parseKeywordsFromText(text)
  if (direct && direct.length >= 1) {
    return { keywords: direct.slice(0, 8), rawText: text }
  }

  const tokenized = text
    .replace(/^키워드\s*[:：]\s*/i, '')
    .split(/[,\n|/]/g)
    .map((v) => v.replace(/^[\s\-*0-9.()]+/, '').trim())
    .filter(Boolean)
  const cleaned = Array.from(new Set(tokenized)).filter(
    (v) => v.length >= 2 && v.length <= 30,
  )
  if (cleaned.length >= 1) {
    return { keywords: cleaned.slice(0, 8), rawText: text }
  }

  return { keywords: null, rawText: text }
}

async function requestGemini({ key, payload, maxRetries = MAX_RETRIES }) {
  let lastError = null

  for (const model of MODELS) {
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
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

        if (!RETRYABLE_STATUS.has(response.status) || attempt === maxRetries) {
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
        if (attempt === maxRetries) break
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

async function streamGeminiReview({ key, rating, keywords, length, res }) {
  const safeKeywords = Array.isArray(keywords)
    ? keywords.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim())
    : []
  const safeLength = REVIEW_LENGTH_MAP[length] ? length : 'medium'

  const prompt = `키워드: ${safeKeywords.join(', ')}\n별점: ${rating}점\n길이: ${REVIEW_LENGTH_MAP[safeLength]}\n\n위 내용으로 리뷰만 작성해. 제목 없이.`

  const response = await fetch(makeStreamUrl(STREAM_MODEL), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': key,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: MAX_OUTPUT_TOKENS[safeLength] ?? 280 },
    }),
  })

  if (!response.ok) {
    let data = {}
    try {
      data = await response.json()
    } catch {
      data = {}
    }
    throw new Error(data?.error?.message || '리뷰 생성 실패')
  }

  if (!response.body) {
    throw new Error('스트리밍 응답 본문이 없습니다.')
  }

  res.statusCode = 200
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('X-Accel-Buffering', 'no')

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
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload)
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) res.write(`${JSON.stringify({ text })}\n`)
      } catch {
        void 0
      }
    }
  }

  if (buffer.startsWith('data: ')) {
    const payload = buffer.slice(6).trim()
    if (payload && payload !== '[DONE]') {
      try {
        const json = JSON.parse(payload)
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) res.write(`${JSON.stringify({ text })}\n`)
      } catch {
        void 0
      }
    }
  }

  res.end()
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

    const prompt =
      `이미지에 보이는 제품·상황에 맞고, 별점 ${rating}점 톤에 어울리는 리뷰용 키워드 8개를 한국어 짧은 구(명사구)로 제안해. ` +
      'JSON만 출력: {"keywords":["...","...","...","...","...","...","...","..."]}'
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
          temperature: 0.1,
          maxOutputTokens: 96,
          responseMimeType: 'application/json',
        },
      },
    })

    if (!result.ok) return json(res, 502, result)

    const firstParsed = parseKeywordsFromAny(result.data)
    if (firstParsed.keywords?.length) {
      return json(res, 200, {
        ok: true,
        keywords: firstParsed.keywords,
        model: result.model,
      })
    }

    return json(res, 502, {
      ok: false,
      error: '키워드 파싱 실패',
      rawText: firstParsed.rawText || '',
    })
  }

  if (body.action === 'review') {
    const rating = Number.isFinite(Number(body.rating)) ? Number(body.rating) : 5
    const keywords = body.keywords
    const length = body.length

    try {
      await streamGeminiReview({
        key,
        rating,
        keywords,
        length,
        res,
      })
      return
    } catch (err) {
      return json(res, 502, {
        ok: false,
        error: err instanceof Error ? err.message : '리뷰 생성 실패',
      })
    }
  }

  return json(res, 400, { ok: false, error: '지원하지 않는 action입니다.' })
}

/* global Buffer, process */
const MODELS = ['gemini-2.5-flash']
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const MAX_RETRIES = 2
const STREAM_MODEL = 'gemini-2.5-flash'

const REVIEW_LENGTH_MAP = {
  short: '2~3문장 이내로 간결하게',
  medium: '4~5문장 분량으로',
  long: '7~8문장의 상세한 내용으로',
}

const REVIEW_TONE_MAP = {
  neutral:
    '1인칭 구매자 입장의 자연스러운 온라인 쇼핑몰 리뷰 말투. 과장하지 말 것.',
  friendly:
    '친근하고 부드러운 말투. 이모티콘·느낌표 남발은 피할 것.',
  formal:
    '정중한 존댓말(~습니다·해요체)로 격식 있게. 무례하지 않게.',
  casual:
    '편한 일상 반말(~했어, ~야 느낌). 공격적·무례한 표현은 금지.',
}

const MAX_OUTPUT_TOKENS = {
  short: 150,
  medium: 280,
  long: 450,
}

/** 키워드 칩·토큰 폴백 공통 길이 (한국어 짧은 구) */
const KEYWORD_LEN_MIN = 2
const KEYWORD_LEN_MAX = 30

const KEYWORDS_MAX_OUTPUT_TOKENS = 192

/** 서로 다른 키워드 개수(한글 필터 통과 후) */
const KEYWORDS_MIN_COUNT = 3
const KEYWORDS_MAX_COUNT = 8

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function makeUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
}

function makeStreamUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`
}

/** 첫 번째 균형 잡힌 `{…}` 또는 `[…]` 구간 (문자열 안의 괄호는 무시) */
function sliceBalancedSegment(str, openCh, closeCh) {
  const start = str.indexOf(openCh)
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < str.length; i += 1) {
    const c = str[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') {
      inStr = true
      continue
    }
    if (c === openCh) depth += 1
    else if (c === closeCh) {
      depth -= 1
      if (depth === 0) return str.slice(start, i + 1)
    }
  }
  return null
}

function hasHangul(s) {
  return /[\uAC00-\uD7A3]/.test(s)
}

/** 모델이 붙이는 영어 안내 줄을 제거해 JSON 파싱이 되도록 함 */
function stripEnglishJsonPreamble(str) {
  let s = str.trimStart()
  for (let i = 0; i < 3; i += 1) {
    const next = s
      .replace(
        /^(?:here\s+is\s+the\s+json\s+requested\s*\.?\s*[:：]?\s*|here\s+is\s+the\s+json\s*[:：]\s*|below\s+is\s+the\s+json\s*[:：]?\s*|the\s+following\s+is\s+(?:the\s+)?json\s*[:：]?\s*|json\s+(?:output|response)\s*[:：]?\s*)/i,
        '',
      )
      .trimStart()
    if (next === s) break
    s = next
  }
  return s
}

function sanitizeKeywordArray(arr) {
  if (!Array.isArray(arr)) return null
  const cleaned = arr
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(
      (s) =>
        s.length >= KEYWORD_LEN_MIN &&
        s.length <= KEYWORD_LEN_MAX &&
        hasHangul(s),
    )
  return cleaned.length ? Array.from(new Set(cleaned)) : null
}

function parseKeywordsFromText(text) {
  if (typeof text !== 'string' || !text.trim()) return null

  const raw = text.trim()
  let normalized = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
  normalized = stripEnglishJsonPreamble(normalized)

  try {
    const parsed = JSON.parse(normalized)
    const fromObject = sanitizeKeywordArray(parsed?.keywords)
    if (fromObject) return fromObject
    const fromArray = sanitizeKeywordArray(parsed)
    if (fromArray) return fromArray
  } catch {
    void 0
  }

  const objSlice = sliceBalancedSegment(normalized, '{', '}')
  if (objSlice) {
    try {
      const parsed = JSON.parse(objSlice)
      const fromObject = sanitizeKeywordArray(parsed?.keywords)
      if (fromObject) return fromObject
    } catch {
      void 0
    }
  }

  const arraySlice = sliceBalancedSegment(normalized, '[', ']')
  if (arraySlice) {
    try {
      const parsed = JSON.parse(arraySlice)
      const fromArray = sanitizeKeywordArray(parsed)
      if (fromArray) return fromArray
    } catch {
      void 0
    }
  }

  const lines = normalized
    .split('\n')
    .map((line) => line.replace(/^[\s\-*0-9.]+/, '').trim())
    .filter(Boolean)
  const fromLines = sanitizeKeywordArray(lines)
  if (fromLines) return fromLines

  const keywordArrayHint = normalized.match(/"keywords"\s*:\s*\[([\s\S]*)$/i)
  if (keywordArrayHint) {
    const quoted = new RegExp(
      `"([^"\\n]{${KEYWORD_LEN_MIN},${KEYWORD_LEN_MAX}})"`,
      'g',
    )
    const candidates = Array.from(
      keywordArrayHint[1].matchAll(quoted),
    ).map((m) => m[1])
    const fromHint = sanitizeKeywordArray(candidates)
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
    if (direct.length < KEYWORDS_MIN_COUNT) {
      return { keywords: null, rawText: text, tooFew: true, partial: direct }
    }
    return {
      keywords: direct.slice(0, KEYWORDS_MAX_COUNT),
      rawText: text,
    }
  }

  const tokenized = text
    .replace(/^키워드\s*[:：]\s*/i, '')
    .split(/[,\n|/]/g)
    .map((v) => v.replace(/^[\s\-*0-9.()]+/, '').trim())
    .filter(Boolean)
  const cleaned = Array.from(new Set(tokenized)).filter(
    (v) =>
      v.length >= KEYWORD_LEN_MIN &&
      v.length <= KEYWORD_LEN_MAX &&
      hasHangul(v),
  )
  if (cleaned.length >= KEYWORDS_MIN_COUNT) {
    return {
      keywords: cleaned.slice(0, KEYWORDS_MAX_COUNT),
      rawText: text,
    }
  }
  if (cleaned.length >= 1) {
    return { keywords: null, rawText: text, tooFew: true, partial: cleaned }
  }

  return { keywords: null, rawText: text }
}

/** 파싱 실패 시 사용자에게 줄 수 있는 API/안전 관련 설명 (텍스트 없음·차단 등) */
function describeKeywordGeminiIssue(data, extractedText) {
  const blockReason = data?.promptFeedback?.blockReason
  if (blockReason) {
    return '입력이 정책에 의해 차단되었습니다. 다른 이미지로 시도해 주세요.'
  }

  const cand = data?.candidates?.[0]
  if (!cand) {
    return '모델이 응답 후보를 반환하지 않았습니다. 잠시 후 다시 시도해 주세요.'
  }

  const hasText =
    typeof extractedText === 'string' && extractedText.trim().length > 0
  const fr = cand.finishReason

  if (!hasText) {
    if (
      fr === 'SAFETY' ||
      fr === 'PROHIBITED_CONTENT' ||
      fr === 'IMAGE_SAFETY' ||
      fr === 'IMAGE_PROHIBITED_CONTENT'
    ) {
      return '안전 정책으로 인해 키워드를 생성할 수 없습니다. 다른 이미지로 시도해 주세요.'
    }
    if (fr === 'RECITATION') {
      return '저작권 정책으로 인해 응답을 생성할 수 없습니다.'
    }
    if (fr === 'MAX_TOKENS') {
      return '응답이 중간에 잘렸습니다. 키워드 다시 생성을 눌러 주세요.'
    }
    if (fr && fr !== 'STOP') {
      return `모델이 텍스트 응답을 만들지 않았습니다. (${fr})`
    }
    return '모델이 빈 응답을 반환했습니다. 다시 시도해 주세요.'
  }

  return null
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

async function streamGeminiReview({ key, rating, keywords, length, tone, res }) {
  const safeKeywords = Array.isArray(keywords)
    ? keywords.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim())
    : []
  const safeLength = REVIEW_LENGTH_MAP[length] ? length : 'medium'
  const safeTone = REVIEW_TONE_MAP[tone] ? tone : 'neutral'

  const prompt =
    `키워드: ${safeKeywords.join(', ')}\n별점: ${rating}점\n길이: ${REVIEW_LENGTH_MAP[safeLength]}\n말투: ${REVIEW_TONE_MAP[safeTone]}\n\n` +
    '위 조건을 모두 지켜 리뷰 본문만 작성해. 제목·머리말·번호 목록 없이.'

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
      `이미지에 보이는 제품·상황에 맞고, 별점 ${rating}점 톤에 어울리는 리뷰용 키워드를 한국어 짧은 구(명사구)로만 제안해. ` +
      `서로 다른 키워드를 최소 ${KEYWORDS_MIN_COUNT}개 이상, 많으면 ${KEYWORDS_MAX_COUNT}개까지 넣어(권장 4~8개). ` +
      '각 값은 반드시 한글을 포함해야 해. 설명 문장·영어 안내(예: Here is the JSON)는 넣지 마. ' +
      '출력은 이 JSON 형식만: {"keywords":["...","...","...","...","...","...","...","..."]}'
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
          maxOutputTokens: KEYWORDS_MAX_OUTPUT_TOKENS,
          responseMimeType: 'application/json',
        },
      },
    })

    if (!result.ok) return json(res, 502, result)

    const firstParsed = parseKeywordsFromAny(result.data)
    if (
      firstParsed.keywords &&
      firstParsed.keywords.length >= KEYWORDS_MIN_COUNT
    ) {
      return json(res, 200, {
        ok: true,
        keywords: firstParsed.keywords,
        model: result.model,
      })
    }

    if (firstParsed.tooFew) {
      const n = firstParsed.partial?.length ?? 0
      if (firstParsed.rawText) {
        console.warn('[gemini keywords] too few after filter:', n)
      }
      return json(res, 502, {
        ok: false,
        error: `키워드가 ${n}개뿐입니다. 최소 ${KEYWORDS_MIN_COUNT}개(권장 4~8개)가 필요합니다. 다시 생성해 주세요.`,
      })
    }

    const apiIssue = describeKeywordGeminiIssue(
      result.data,
      firstParsed.rawText,
    )
    if (firstParsed.rawText) {
      console.warn(
        '[gemini keywords] parse failed, snippet:',
        firstParsed.rawText.slice(0, 200),
      )
    }

    return json(res, 502, {
      ok: false,
      error:
        apiIssue ??
        '키워드 형식을 읽을 수 없습니다. 키워드 다시 생성을 눌러 주세요.',
    })
  }

  if (body.action === 'review') {
    const rating = Number.isFinite(Number(body.rating)) ? Number(body.rating) : 5
    const keywords = body.keywords
    const length = body.length
    const tone =
      typeof body.tone === 'string' && REVIEW_TONE_MAP[body.tone]
        ? body.tone
        : 'neutral'

    try {
      await streamGeminiReview({
        key,
        rating,
        keywords,
        length,
        tone,
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

import { createJsonHeaders, readJsonSafely } from '../../shared/httpJson.js'
import { normalizeKeywordText } from '../../shared/keywordPhrase.js'
import { readLines } from '../../shared/streamLines.js'
import { buildReviewPrompt } from './prompts.js'
import {
  buildReviewGenerationConfig,
  humanizeGeminiApiError,
  STREAM_GENERATE_URL,
} from './geminiClient.js'
import { setCommonSecurityHeaders } from '../httpResponse.js'

// input: 요청 본문. buildReviewPrompt가 필요한 필드만 꺼내 정리합니다.
export async function streamGeminiReview({ key, input, res }) {
  const { prompt, safeLength, minReviewChars } = buildReviewPrompt(input)

  // 사용자가 연결을 끊으면 Gemini 생성도 멈춰 토큰을 아낍니다.
  const upstream = new AbortController()
  // 정상 종료(res.end) 뒤에도 'close'가 오므로 끝나지 않은 응답에서만 중단합니다.
  res.on?.('close', () => {
    if (!res.writableFinished) upstream.abort()
  })

  let response
  try {
    response = await fetch(STREAM_GENERATE_URL, {
      method: 'POST',
      signal: upstream.signal,
      headers: createJsonHeaders({ 'x-goog-api-key': key }),
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: buildReviewGenerationConfig(safeLength),
      }),
    })
  } catch (err) {
    if (upstream.signal.aborted) return
    throw err
  }

  if (!response.ok) {
    const data = await readJsonSafely(response)
    if (upstream.signal.aborted) return
    const raw = data?.error?.message || '리뷰 생성 실패'
    throw new Error(humanizeGeminiApiError(response.status, raw))
  }
  if (!response.body) {
    throw new Error('스트리밍 응답 본문이 없습니다.')
  }

  res.statusCode = 200
  setCommonSecurityHeaders(res)
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('X-Accel-Buffering', 'no')

  let fullText = ''
  let finishReason = null
  const writeJsonLine = (payload) => {
    res.write(`${JSON.stringify(payload)}\n`)
  }

  const handleSsePayload = (payload) => {
    if (!payload || payload === '[DONE]') return
    try {
      const jsonData = JSON.parse(payload)
      finishReason = jsonData?.candidates?.[0]?.finishReason ?? finishReason
      const text = jsonData?.candidates?.[0]?.content?.parts?.[0]?.text
      if (text) {
        fullText += text
        writeJsonLine({ text })
      }
    } catch {
      void 0
    }
  }

  try {
    for await (const line of readLines(response.body)) {
      if (line.startsWith('data: ')) handleSsePayload(line.slice(6).trim())
    }
  } catch (err) {
    if (upstream.signal.aborted) return
    writeJsonLine({
      error: err instanceof Error ? err.message : '스트리밍 응답을 읽지 못했습니다.',
    })
    return res.end()
  }

  const normalizedReview = normalizeKeywordText(fullText)
  if (finishReason === 'MAX_TOKENS') {
    writeJsonLine({
      error: '리뷰가 중간에 잘렸습니다. 글자수보다 완성된 리뷰를 우선해 다시 생성해 주세요.',
    })
    return res.end()
  }
  if (normalizedReview.length < minReviewChars) {
    writeJsonLine({ error: '리뷰가 너무 짧게 생성되었습니다. 다시 생성해 주세요.' })
    return res.end()
  }
  writeJsonLine({ done: true, finishReason })
  res.end()
}

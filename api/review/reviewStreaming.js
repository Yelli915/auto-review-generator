import { createJsonHeaders, readJsonSafely } from '../../shared/httpJson.js'
import { buildReviewPrompt } from '../prompts.js'
import { MODEL } from './providers/gemini/config.js'
import {
  buildReviewGenerationConfig,
  humanizeGeminiApiError,
  makeStreamUrl,
} from './providers/gemini/client.js'
import { setCommonSecurityHeaders } from './httpResponse.js'

function normalizeReviewText(text) {
  return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : ''
}

export async function streamGeminiReview({
  key,
  rating,
  keywords,
  length,
  tone,
  category,
  subcategory,
  productContext,
  previousReview,
  rewriteInstruction,
  res,
}) {
  const { prompt, safeLength, minReviewChars } = buildReviewPrompt({
    rating,
    keywords,
    length,
    tone,
    category,
    subcategory,
    productContext,
    previousReview,
    rewriteInstruction,
  })

  const response = await fetch(makeStreamUrl(MODEL), {
    method: 'POST',
    headers: createJsonHeaders({ 'x-goog-api-key': key }),
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: buildReviewGenerationConfig(safeLength),
    }),
  })

  if (!response.ok) {
    const data = await readJsonSafely(response)
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

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
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
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        handleSsePayload(line.slice(6).trim())
      }
    }

    if (buffer.trim()) {
      for (const line of buffer.split('\n')) {
        if (!line.startsWith('data: ')) continue
        handleSsePayload(line.slice(6).trim())
      }
    }
  } catch (err) {
    writeJsonLine({
      error: err instanceof Error ? err.message : '스트리밍 응답을 읽지 못했습니다.',
    })
    return res.end()
  }

  const normalizedReview = normalizeReviewText(fullText)
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

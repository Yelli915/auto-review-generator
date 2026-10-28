import { createJsonHeaders, readJsonSafely } from '../../shared/httpJson.js'
import { buildReviewPrompt } from './prompts.js'
import { DEBUG_LOGS } from '../core/config.js'
import { MODEL } from './gemini/config.js'
import {
  buildReviewGenerationConfig,
  humanizeGeminiApiError,
  makeStreamUrl,
} from './gemini/client.js'
import { setCommonSecurityHeaders } from '../core/httpResponse.js'
import { collectReviewQualityIssues } from './reviewQualityCheck.js'

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
  const { prompt, safeCategory, safeKeywords, safeLength, minReviewChars } = buildReviewPrompt({
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

  // 사용자가 연결을 끊으면 Gemini 생성도 멈춰 토큰을 아낍니다.
  const upstream = new AbortController()
  res.on?.('close', () => upstream.abort())

  const response = await fetch(makeStreamUrl(MODEL), {
    method: 'POST',
    signal: upstream.signal,
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
      // 끝나면 줄바꿈을 붙여 마지막 줄도 같은 경로로 처리합니다.
      buffer += done ? '\n' : decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        handleSsePayload(line.slice(6).trim())
      }
      if (done) break
    }
  } catch (err) {
    if (upstream.signal.aborted) return
    writeJsonLine({
      error: err instanceof Error ? err.message : '스트리밍 응답을 읽지 못했습니다.',
    })
    return res.end()
  }

  const normalizedReview = normalizeReviewText(fullText)
  // 잘린 리뷰는 어차피 에러로 버려지므로 품질 데이터에서 제외합니다.
  if (DEBUG_LOGS && normalizedReview && finishReason !== 'MAX_TOKENS') {
    const issues = collectReviewQualityIssues({
      category: safeCategory,
      keywords: safeKeywords,
      reviewText: normalizedReview,
    })
    if (issues) {
      console.warn('[gemini review] quality check', issues)
    }
  }
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

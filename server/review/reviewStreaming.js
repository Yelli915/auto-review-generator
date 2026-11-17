import { createJsonHeaders, readJsonSafely } from '../../shared/httpJson.js'
import { normalizeKeywordText } from '../../shared/keywordPhrase.js'
import { readLines } from '../../shared/streamLines.js'
import { buildReviewPrompt } from './prompts.js'
import {
  buildReviewGenerationConfig,
  humanizeGeminiApiError,
  parseGeminiSseLine,
  STREAM_GENERATE_URL,
} from './geminiClient.js'
import { setCommonSecurityHeaders } from '../httpResponse.js'

// input: 요청 본문. buildReviewPrompt가 필요한 필드만 꺼내 정리합니다.
// refund: 화면이 초안을 버리는 실패(스트리밍 중 오류, 첫 글자 전 연결 끊김)에서 사용량을 되돌리고 남은 횟수를 돌려줍니다.
// 스트리밍 전 Gemini 오류는 throw하고, 그때 되돌리는 건 호출하는 쪽 몫입니다.
export async function streamGeminiReview({ key, input, res, refund }) {
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
    if (upstream.signal.aborted) return refund?.()
    throw err
  }

  if (!response.ok) {
    const data = await readJsonSafely(response)
    if (upstream.signal.aborted) return refund?.()
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
  const fail = async (error) => {
    const remaining = await refund?.()
    writeJsonLine(Number.isFinite(remaining) ? { error, remaining } : { error })
    res.end()
  }

  try {
    for await (const line of readLines(response.body)) {
      const chunk = parseGeminiSseLine(line)
      if (!chunk) continue
      finishReason = chunk.finishReason ?? finishReason
      if (chunk.text) {
        fullText += chunk.text
        writeJsonLine({ text: chunk.text })
      }
    }
  } catch (err) {
    // 글을 일부라도 받은 뒤 사용자가 떠났으면 차감을 유지합니다.
    if (upstream.signal.aborted) return fullText ? undefined : refund?.()
    return fail(err instanceof Error ? err.message : '스트리밍 응답을 읽지 못했습니다.')
  }

  const normalizedReview = normalizeKeywordText(fullText)
  if (finishReason === 'MAX_TOKENS') {
    return fail('리뷰가 중간에 잘렸습니다. 글자수보다 완성된 리뷰를 우선해 다시 생성해 주세요.')
  }
  if (normalizedReview.length < minReviewChars) {
    return fail('리뷰가 너무 짧게 생성되었습니다. 다시 생성해 주세요.')
  }
  writeJsonLine({ done: true, finishReason })
  res.end()
}

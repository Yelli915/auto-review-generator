import {
  MAX_PRODUCT_URL_LENGTH,
  READER_BASE_URL,
  READER_FETCH_HEADERS,
  READER_PAGE_TIMEOUT_MS,
} from './config.js'
import {
  buildAnalysisResult,
  buildProductInfo,
  isAccessChallengeText,
  productNameFromUrl,
} from './productInfo.js'
import { formatProductContext } from '../../shared/productContext.js'
import { fetchPublicUrl, readResponseTextLimited } from './publicFetch.js'

function buildReaderUrl(urlString) {
  return `${READER_BASE_URL}${urlString}`
}

function cleanReaderText(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^URL Source:/i.test(line))
    .filter((line) => !/^Markdown Content:/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractReaderTitle(text) {
  const titleLine = String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^Title:\s*/i.test(line))
  return titleLine ? titleLine.replace(/^Title:\s*/i, '').trim() : ''
}

// 제목과 본문은 한 번만 뽑아 상품 정보와 프롬프트 근거에 같이 씁니다.
function buildReaderAnalysisParts(text, urlString, reason = '') {
  const url = new URL(urlString)
  const title = extractReaderTitle(text)
  const body = cleanReaderText(text)
    .replace(/^Title:\s*.*$/im, '')
    .trim()
  const productName = productNameFromUrl(url)
  const summary = body.slice(0, 1800).trim()
  const productContext = formatProductContext({ site: url.hostname }, urlString, [
    title && `페이지 제목: ${title}`,
    !title && productName && `상품명 추정: ${productName}`,
    reason && `직접 읽기 상태: ${reason}`,
    summary && `페이지 내용: ${summary}`,
  ])
  const product = buildProductInfo({
    name: title || productName,
    site: url.hostname,
    description: body.slice(0, 600),
    url: urlString,
  })
  return { product, productContext }
}

export async function fetchReaderProductAnalysis(urlString, reason = '', signal) {
  let response
  try {
    const fetched = await fetchPublicUrl(buildReaderUrl(urlString), {
      headers: READER_FETCH_HEADERS,
      maxLength: MAX_PRODUCT_URL_LENGTH + READER_BASE_URL.length,
      timeoutMs: READER_PAGE_TIMEOUT_MS,
      signal,
    })
    if (!fetched.ok) return null
    response = fetched.response
  } catch {
    return null
  }

  if (!response.ok) {
    await response.body?.cancel()
    return null
  }

  try {
    const text = await readResponseTextLimited(response)
    if (!text.trim()) return null
    if (isAccessChallengeText(text)) return null
    // 보조 읽기는 요약된 본문이라 상품 정보가 정확하지 않을 수 있어 항상 확인을 받습니다.
    return buildAnalysisResult({
      url: urlString,
      ...buildReaderAnalysisParts(text, urlString, reason),
      analysisStatus: 'reader',
      warning: reason
        ? '상품 페이지 본문을 직접 읽지 못해 보조 읽기 방식으로 정보를 가져왔습니다.'
        : '',
      needsManualInput: true,
    })
  } catch {
    return null
  }
}

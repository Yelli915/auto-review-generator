import { isAccessChallengeText } from './accessChallenge.js'
import {
  MAX_PRODUCT_URL_LENGTH,
  READER_BASE_URL,
  READER_FETCH_HEADERS,
  READER_PAGE_TIMEOUT_MS,
} from './config.js'
import { buildProductInfo, productNameFromUrl } from './productInfo.js'
import { fetchPublicUrl } from './publicFetch.js'
import { readResponseTextLimited } from './responseText.js'

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

function buildReaderProductContext(text, urlString, reason = '') {
  const url = new URL(urlString)
  const title = extractReaderTitle(text)
  const cleaned = cleanReaderText(text)
    .replace(/^Title:\s*.*$/im, '')
    .trim()
  const summary = cleaned.slice(0, 1800).trim()
  const productName = productNameFromUrl(url)
  const parts = [
    `사이트: ${url.hostname}`,
    title && `페이지 제목: ${title}`,
    !title && productName && `상품명 추정: ${productName}`,
    reason && `직접 읽기 상태: ${reason}`,
    summary && `페이지 내용: ${summary}`,
    `링크: ${urlString}`,
  ].filter(Boolean)
  return parts.join('\n')
}

function buildReaderProductInfo(text, urlString) {
  const url = new URL(urlString)
  return buildProductInfo({
    name: extractReaderTitle(text) || productNameFromUrl(url),
    site: url.hostname,
    description: cleanReaderText(text)
      .replace(/^Title:\s*.*$/im, '')
      .trim()
      .slice(0, 600),
    url: urlString,
  })
}

export async function fetchReaderProductAnalysis(urlString, reason = '') {
  let response
  try {
    const fetched = await fetchPublicUrl(buildReaderUrl(urlString), {
      headers: READER_FETCH_HEADERS,
      maxLength: MAX_PRODUCT_URL_LENGTH + READER_BASE_URL.length,
      timeoutMs: READER_PAGE_TIMEOUT_MS,
    })
    if (!fetched.ok) return null
    response = fetched.response
  } catch {
    return null
  }

  if (!response.ok) return null

  try {
    const text = await readResponseTextLimited(response)
    if (!text.trim()) return null
    if (isAccessChallengeText(text)) return null
    return {
      ok: true,
      url: urlString,
      product: buildReaderProductInfo(text, urlString),
      analysisStatus: 'reader',
      warning: reason
        ? '상품 페이지 본문을 직접 읽지 못해 보조 읽기 방식으로 정보를 가져왔습니다.'
        : '',
      productContext: buildReaderProductContext(text, urlString, reason),
      optionGroups: [],
      needsManualInput: isAccessChallengeText(reason),
    }
  } catch {
    return null
  }
}

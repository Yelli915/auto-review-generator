import {
  FALLBACK_WARNINGS,
  MAX_PRODUCT_URL_LENGTH,
  PRODUCT_ANALYSIS_CACHE_MAX,
  PRODUCT_ANALYSIS_CACHE_TTL_MS,
  PRODUCT_ANALYSIS_DEADLINE_MS,
  PRODUCT_FETCH_HEADERS,
} from './config.js'
import {
  extractProductInfoFromHtml,
  extractProductOptionGroupsFromHtml,
  isAccessChallengeHtml,
} from './htmlProduct.js'
import { formatProductContext } from '../../shared/productContext.js'
import {
  buildProductInfo,
  hasUsefulProductInfo,
  productNameFromUrl,
} from './productInfo.js'
import { fetchPublicUrl } from './publicFetch.js'
import { fetchReaderProductAnalysis } from './reader.js'
import { readResponseTextLimited } from './responseText.js'
import { buildAnalysisResult } from './result.js'
import { validatePublicHttpUrl } from '../publicUrlGuard.js'

// -- product analysis cache (TTL-based) --

const productAnalysisCache = new Map()

export function clearProductAnalysisCache() {
  productAnalysisCache.clear()
}

function getCachedProductAnalysis(urlString) {
  const cached = productAnalysisCache.get(urlString)
  if (!cached) return null
  if (Date.now() - cached.createdAt > PRODUCT_ANALYSIS_CACHE_TTL_MS) {
    productAnalysisCache.delete(urlString)
    return null
  }
  return cached.value
}

function cacheProductAnalysis(urlString, value) {
  productAnalysisCache.set(urlString, {
    createdAt: Date.now(),
    value,
  })
  if (productAnalysisCache.size > PRODUCT_ANALYSIS_CACHE_MAX) {
    const firstKey = productAnalysisCache.keys().next().value
    if (firstKey) productAnalysisCache.delete(firstKey)
  }
  return value
}

// -- fallback analysis builders (used when the page can't be read normally) --

function buildFallbackProductContext(urlString, reason = '') {
  const url = new URL(urlString)
  const productName = productNameFromUrl(url)
  const parts = [
    `사이트: ${url.hostname}`,
    productName && `상품명 추정: ${productName}`,
    reason && `페이지 수집 상태: ${reason}`,
    `링크: ${urlString}`,
  ].filter(Boolean)
  return parts.join('\n')
}

function buildFallbackProductInfo(urlString) {
  const url = new URL(urlString)
  return buildProductInfo({
    name: productNameFromUrl(url),
    site: url.hostname,
    url: urlString,
  })
}

function buildFallbackAnalysis(url, reason, warning) {
  return buildAnalysisResult({
    url,
    product: buildFallbackProductInfo(url),
    productContext: buildFallbackProductContext(url, reason),
    analysisStatus: 'fallback',
    warning,
    needsManualInput: true,
  })
}

const PRODUCT_URL_REQUIRED_ERROR = '상품 링크를 입력해 주세요.'
const PRODUCT_URL_TOO_LONG_ERROR = '상품 링크가 너무 깁니다.'
const PUBLIC_PRODUCT_URL_ERROR =
  '공개된 http/https 상품 페이지 링크만 사용할 수 있습니다.'
const PRODUCT_FETCH_REJECTED_ERROR = '상품 분석 요청이 거절되었습니다.'

async function normalizeProductUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { ok: false, status: 400, error: PRODUCT_URL_REQUIRED_ERROR }
  }

  return validatePublicHttpUrl(rawUrl, {
    errorMessage: PUBLIC_PRODUCT_URL_ERROR,
    maxLength: MAX_PRODUCT_URL_LENGTH,
    tooLongError: PRODUCT_URL_TOO_LONG_ERROR,
  })
}

// reader로 다시 읽어 보고(useReader가 false면 생략), 실패하면 URL만으로 만든 대체 결과를 돌려줍니다.
async function fallBackProductAnalysis(url, signal, { reason = '', useReader = true, message, warning }) {
  const alternate = useReader && (await fetchReaderProductAnalysis(url, reason, signal))
  return alternate || buildFallbackAnalysis(url, message, warning)
}

// beforeFetch: 캐시에 없어 실제로 페이지를 읽기 직전에 호출됩니다. false를 돌려주면 중단합니다.
export async function fetchProductAnalysis(rawUrl, { beforeFetch } = {}) {
  const normalized = await normalizeProductUrl(rawUrl)
  if (!normalized.ok) return normalized
  const cached = getCachedProductAnalysis(normalized.url)
  if (cached) return cached
  if (beforeFetch && !(await beforeFetch())) {
    return { ok: false, status: 429, error: PRODUCT_FETCH_REJECTED_ERROR }
  }

  // direct → reader가 하나의 제한 시간을 나눠 써서 함수 최대 실행 시간 전에 끝냅니다.
  const signal = AbortSignal.timeout(PRODUCT_ANALYSIS_DEADLINE_MS)
  const result = await analyzeProductUrl(normalized.url, signal)
  // 시간 초과로 만든 대체 결과는 다음 시도에서 다시 읽도록 캐시하지 않습니다.
  if (result.ok && !signal.aborted) {
    cacheProductAnalysis(normalized.url, result)
    if (result.url !== normalized.url) cacheProductAnalysis(result.url, result)
  }
  return result
}

async function analyzeProductUrl(url, signal) {
  let response
  let responseUrl = url
  try {
    const fetched = await fetchPublicUrl(url, {
      headers: PRODUCT_FETCH_HEADERS,
      signal,
    })
    if (!fetched.ok) return fetched
    response = fetched.response
    responseUrl = fetched.url
  } catch {
    return fallBackProductAnalysis(url, signal, {
      reason: 'direct fetch failed',
      message: '서버에서 페이지를 직접 읽지 못했습니다.',
      warning: FALLBACK_WARNINGS.fetchFailed,
    })
  }

  if (!response.ok) {
    return fallBackProductAnalysis(responseUrl, signal, {
      reason: `HTTP ${response.status}`,
      message: `HTTP ${response.status} 응답으로 페이지 본문을 읽지 못했습니다.`,
      warning: FALLBACK_WARNINGS.httpBlocked,
    })
  }

  const contentType = response.headers.get('content-type') || ''
  if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    return fallBackProductAnalysis(responseUrl, signal, {
      useReader: false,
      message: 'HTML 페이지가 아닌 응답입니다.',
      warning: FALLBACK_WARNINGS.nonHtml,
    })
  }

  try {
    const html = await readResponseTextLimited(response)
    if (isAccessChallengeHtml(html)) {
      return fallBackProductAnalysis(responseUrl, signal, {
        reason: 'access challenge page',
        message: 'Access challenge page returned instead of product content.',
        warning: FALLBACK_WARNINGS.httpBlocked,
      })
    }

    const product = extractProductInfoFromHtml(html, responseUrl)
    const productContext = formatProductContext(product, responseUrl)
    const hasInfo = hasUsefulProductInfo(product)
    return buildAnalysisResult({
      url: responseUrl,
      product: hasInfo ? product : buildFallbackProductInfo(responseUrl),
      productContext:
        productContext.trim() ||
        buildFallbackProductContext(
          responseUrl,
          '페이지에서 상품 메타 정보를 찾지 못했습니다.',
        ),
      optionGroups: extractProductOptionGroupsFromHtml(html),
      analysisStatus: hasInfo ? 'ok' : 'fallback',
      warning: hasInfo ? '' : FALLBACK_WARNINGS.noMetadata,
      needsManualInput: !hasInfo,
    })
  } catch (err) {
    return fallBackProductAnalysis(responseUrl, signal, {
      useReader: false,
      message: err instanceof Error ? err.message : '상품 정보를 읽지 못했습니다.',
      warning: FALLBACK_WARNINGS.readFailed,
    })
  }
}

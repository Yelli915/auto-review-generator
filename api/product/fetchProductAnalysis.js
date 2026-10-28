import {
  FALLBACK_WARNINGS,
  MAX_PRODUCT_URL_LENGTH,
  PRODUCT_ANALYSIS_CACHE_MAX,
  PRODUCT_ANALYSIS_CACHE_TTL_MS,
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
import { fetchRenderedProductAnalysis } from './rendered.js'
import { readResponseTextLimited } from './responseText.js'
import { buildAnalysisResult } from './result.js'
import { validatePublicHttpUrl } from '../publicUrlGuard.js'

// -- product analysis cache (per fetch-implementation scope, TTL-based) --

const productAnalysisCache = new Map()
const fetchCacheScopes = new WeakMap()
let nextFetchCacheScope = 1

function getProductAnalysisCacheKey(urlString) {
  const fetchImpl = globalThis.fetch
  if (typeof fetchImpl !== 'function') return urlString
  let scope = fetchCacheScopes.get(fetchImpl)
  if (!scope) {
    scope = nextFetchCacheScope
    nextFetchCacheScope += 1
    fetchCacheScopes.set(fetchImpl, scope)
  }
  return `${scope}:${urlString}`
}

function getCachedProductAnalysis(urlString) {
  const cacheKey = getProductAnalysisCacheKey(urlString)
  const cached = productAnalysisCache.get(cacheKey)
  if (!cached) return null
  if (Date.now() - cached.createdAt > PRODUCT_ANALYSIS_CACHE_TTL_MS) {
    productAnalysisCache.delete(cacheKey)
    return null
  }
  return cached.value
}

function cacheProductAnalysis(urlString, value) {
  productAnalysisCache.set(getProductAnalysisCacheKey(urlString), {
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

async function cacheRenderedProductAnalysis(urlString) {
  const renderedAnalysis = await fetchRenderedProductAnalysis(urlString)
  return renderedAnalysis ? cacheProductAnalysis(urlString, renderedAnalysis) : null
}

async function fetchReaderOrRenderedProductAnalysis(urlString, reason = '') {
  const readerAnalysis = await fetchReaderProductAnalysis(urlString, reason)
  if (readerAnalysis) {
    return cacheProductAnalysis(urlString, readerAnalysis)
  }

  const renderedAnalysis = await cacheRenderedProductAnalysis(urlString)
  if (renderedAnalysis) {
    return renderedAnalysis
  }

  return null
}

// 보조 읽기(reader → rendered, useReader가 false면 rendered만)를 시도하고,
// 모두 실패하면 URL만으로 만든 대체 결과를 캐시합니다.
async function fallBackProductAnalysis(url, { reason = '', useReader = true, message, warning }) {
  const alternate = useReader
    ? await fetchReaderOrRenderedProductAnalysis(url, reason)
    : await cacheRenderedProductAnalysis(url)
  return alternate || cacheProductAnalysis(url, buildFallbackAnalysis(url, message, warning))
}

export async function fetchProductAnalysis(rawUrl) {
  const normalized = await normalizeProductUrl(rawUrl)
  if (!normalized.ok) return normalized
  const cached = getCachedProductAnalysis(normalized.url)
  if (cached) return cached

  let response
  let responseUrl = normalized.url
  try {
    const fetched = await fetchPublicUrl(normalized.url, {
      headers: PRODUCT_FETCH_HEADERS,
    })
    if (!fetched.ok) return fetched
    response = fetched.response
    responseUrl = fetched.url
  } catch {
    return fallBackProductAnalysis(normalized.url, {
      reason: 'direct fetch failed',
      message: '서버에서 페이지를 직접 읽지 못했습니다.',
      warning: FALLBACK_WARNINGS.fetchFailed,
    })
  }

  if (!response.ok) {
    return fallBackProductAnalysis(responseUrl, {
      reason: `HTTP ${response.status}`,
      message: `HTTP ${response.status} 응답으로 페이지 본문을 읽지 못했습니다.`,
      warning: FALLBACK_WARNINGS.httpBlocked,
    })
  }

  const contentType = response.headers.get('content-type') || ''
  if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    return fallBackProductAnalysis(responseUrl, {
      useReader: false,
      message: 'HTML 페이지가 아닌 응답입니다.',
      warning: FALLBACK_WARNINGS.nonHtml,
    })
  }

  try {
    const html = await readResponseTextLimited(response)
    if (isAccessChallengeHtml(html)) {
      return fallBackProductAnalysis(responseUrl, {
        reason: 'access challenge page',
        message: 'Access challenge page returned instead of product content.',
        warning: FALLBACK_WARNINGS.httpBlocked,
      })
    }

    const product = extractProductInfoFromHtml(html, responseUrl)
    const productContext = formatProductContext(product, responseUrl)
    const hasInfo = hasUsefulProductInfo(product)
    if (!hasInfo) {
      const renderedAnalysis = await cacheRenderedProductAnalysis(responseUrl)
      if (renderedAnalysis) {
        return renderedAnalysis
      }
    }
    return cacheProductAnalysis(
      responseUrl,
      buildAnalysisResult({
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
      }),
    )
  } catch (err) {
    return fallBackProductAnalysis(responseUrl, {
      useReader: false,
      message: err instanceof Error ? err.message : '상품 정보를 읽지 못했습니다.',
      warning: FALLBACK_WARNINGS.readFailed,
    })
  }
}

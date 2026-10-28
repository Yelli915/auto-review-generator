import {
  FALLBACK_WARNINGS,
  PRODUCT_FETCH_HEADERS,
} from './config.js'
import {
  extractProductInfoFromHtml,
  extractProductOptionGroupsFromHtml,
  isAccessChallengeHtml,
} from './htmlProduct.js'
import { formatProductContext } from '../../shared/productContext.js'
import { hasUsefulProductInfo } from './productInfo.js'
import { getCachedProductAnalysis, cacheProductAnalysis } from './cache.js'
import {
  cacheRenderedProductAnalysis,
  fetchReaderOrRenderedProductAnalysis,
} from './fallbackAnalysis.js'
import {
  buildFallbackAnalysis,
  buildFallbackProductContext,
  buildFallbackProductInfo,
} from './fallbacks.js'
import { normalizeProductUrl } from './url.js'
import { fetchPublicUrl } from './publicFetch.js'
import { readResponseTextLimited } from './responseText.js'
import { buildAnalysisResult } from './result.js'

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

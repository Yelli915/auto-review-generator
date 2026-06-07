import {
  FALLBACK_WARNINGS,
  PRODUCT_FETCH_HEADERS,
} from './config.js'
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
import {
  extractProductInfoFromHtml,
  isAccessChallengeHtml,
} from './htmlProduct.js'
import { extractProductOptionGroupsFromHtml } from './options.js'
import {
  buildProductContext,
  hasUsefulProductInfo,
} from './productInfo.js'
import { readResponseTextLimited } from './responseText.js'
import { buildAnalysisResult } from './result.js'
import { normalizeProductUrl } from './url.js'
import { fetchPublicUrl } from './publicFetch.js'

function cacheFallbackProductAnalysis(url, reason, warning) {
  return cacheProductAnalysis(
    url,
    buildFallbackAnalysis(url, reason, warning),
  )
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
    const fallbackAnalysis = await fetchReaderOrRenderedProductAnalysis(
      normalized.url,
      'direct fetch failed',
    )
    if (fallbackAnalysis) {
      return fallbackAnalysis
    }

    return cacheFallbackProductAnalysis(
      normalized.url,
      '서버에서 페이지를 직접 읽지 못했습니다.',
      FALLBACK_WARNINGS.fetchFailed,
    )
  }

  if (!response.ok) {
    const fallbackAnalysis = await fetchReaderOrRenderedProductAnalysis(
      responseUrl,
      `HTTP ${response.status}`,
    )
    if (fallbackAnalysis) {
      return fallbackAnalysis
    }

    return cacheFallbackProductAnalysis(
      responseUrl,
      `HTTP ${response.status} 응답으로 페이지 본문을 읽지 못했습니다.`,
      FALLBACK_WARNINGS.httpBlocked,
    )
  }

  const contentType = response.headers.get('content-type') || ''
  if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    const renderedAnalysis = await cacheRenderedProductAnalysis(responseUrl)
    if (renderedAnalysis) {
      return renderedAnalysis
    }

    return cacheFallbackProductAnalysis(
      responseUrl,
      'HTML 페이지가 아닌 응답입니다.',
      FALLBACK_WARNINGS.nonHtml,
    )
  }

  try {
    const html = await readResponseTextLimited(response)
    if (isAccessChallengeHtml(html)) {
      const fallbackAnalysis = await fetchReaderOrRenderedProductAnalysis(
        responseUrl,
        'access challenge page',
      )
      if (fallbackAnalysis) {
        return fallbackAnalysis
      }

      return cacheFallbackProductAnalysis(
        responseUrl,
        'Access challenge page returned instead of product content.',
        FALLBACK_WARNINGS.httpBlocked,
      )
    }

    const product = extractProductInfoFromHtml(html, responseUrl)
    const productContext = buildProductContext(product, responseUrl)
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
    const renderedAnalysis = await cacheRenderedProductAnalysis(responseUrl)
    if (renderedAnalysis) {
      return renderedAnalysis
    }

    return cacheFallbackProductAnalysis(
      responseUrl,
      err instanceof Error ? err.message : '상품 정보를 읽지 못했습니다.',
      FALLBACK_WARNINGS.readFailed,
    )
  }
}

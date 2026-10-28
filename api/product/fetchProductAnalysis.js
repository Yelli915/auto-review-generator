import {
  FALLBACK_WARNINGS,
  PRODUCT_ANALYSIS_DEADLINE_MS,
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
import { fetchReaderOrRenderedProductAnalysis } from './fallbackAnalysis.js'
import {
  buildFallbackAnalysis,
  buildFallbackProductContext,
  buildFallbackProductInfo,
} from './fallbacks.js'
import { normalizeProductUrl } from './url.js'
import { fetchPublicUrl } from './publicFetch.js'
import { fetchRenderedProductAnalysis } from './rendered.js'
import { readResponseTextLimited } from './responseText.js'
import { buildAnalysisResult } from './result.js'

export { clearProductAnalysisCache } from './cache.js'

const PRODUCT_FETCH_REJECTED_ERROR = '상품 분석 요청이 거절되었습니다.'

// 보조 읽기(reader → rendered, useReader가 false면 rendered만)를 시도하고,
// 모두 실패하면 URL만으로 만든 대체 결과를 돌려줍니다.
async function fallBackProductAnalysis(url, signal, { reason = '', useReader = true, message, warning }) {
  const alternate = useReader
    ? await fetchReaderOrRenderedProductAnalysis(url, reason, signal)
    : await fetchRenderedProductAnalysis(url, signal)
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

  // direct → reader → rendered가 하나의 제한 시간을 나눠 써서 함수 최대 실행 시간 전에 끝냅니다.
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
    if (!hasInfo) {
      const renderedAnalysis = await fetchRenderedProductAnalysis(responseUrl, signal)
      if (renderedAnalysis) {
        return renderedAnalysis
      }
    }
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

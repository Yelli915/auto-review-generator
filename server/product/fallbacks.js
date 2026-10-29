import { formatProductContext } from '../../shared/productContext.js'
import { buildAnalysisResult, buildProductInfo, productNameFromUrl } from './productInfo.js'

export function buildFallbackProductContext(urlString, reason = '') {
  const url = new URL(urlString)
  const productName = productNameFromUrl(url)
  return formatProductContext({ site: url.hostname }, urlString, [
    productName && `상품명 추정: ${productName}`,
    reason && `페이지 수집 상태: ${reason}`,
  ])
}

export function buildFallbackProductInfo(urlString) {
  const url = new URL(urlString)
  return buildProductInfo({
    name: productNameFromUrl(url),
    site: url.hostname,
    url: urlString,
  })
}

export function buildFallbackAnalysis(url, reason, warning) {
  return buildAnalysisResult({
    url,
    product: buildFallbackProductInfo(url),
    productContext: buildFallbackProductContext(url, reason),
    analysisStatus: 'fallback',
    warning,
    needsManualInput: true,
  })
}

import { fetchRenderedProductInfo } from '../renderedProductContext.js'
import { FALLBACK_WARNINGS, PRODUCT_FETCH_HEADERS } from './config.js'
import {
  buildProductContext,
  buildProductInfo,
  hasUsefulProductInfo,
  normalizeImageUrl,
} from './productInfo.js'
import { buildAnalysisResult } from './result.js'

export async function fetchRenderedProductAnalysis(urlString) {
  const product = await fetchRenderedProductInfo(
    urlString,
    PRODUCT_FETCH_HEADERS['User-Agent'],
  )
  if (!product) return null
  const normalizedProduct = buildProductInfo({
    ...product,
    imageUrl: normalizeImageUrl(product.imageUrl, urlString),
    url: urlString,
  })
  if (!hasUsefulProductInfo(normalizedProduct)) return null
  return buildAnalysisResult({
    url: urlString,
    product: normalizedProduct,
    productContext: buildProductContext(normalizedProduct, urlString),
    optionGroups: [],
    analysisStatus: 'rendered',
    warning: FALLBACK_WARNINGS.rendered,
  })
}

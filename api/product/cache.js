import {
  PRODUCT_ANALYSIS_CACHE_MAX,
  PRODUCT_ANALYSIS_CACHE_TTL_MS,
} from './config.js'

const productAnalysisCache = new Map()

export function clearProductAnalysisCache() {
  productAnalysisCache.clear()
}

export function getCachedProductAnalysis(urlString) {
  const cached = productAnalysisCache.get(urlString)
  if (!cached) return null
  if (Date.now() - cached.createdAt > PRODUCT_ANALYSIS_CACHE_TTL_MS) {
    productAnalysisCache.delete(urlString)
    return null
  }
  return cached.value
}

export function cacheProductAnalysis(urlString, value) {
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

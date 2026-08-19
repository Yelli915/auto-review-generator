import {
  PRODUCT_ANALYSIS_CACHE_MAX,
  PRODUCT_ANALYSIS_CACHE_TTL_MS,
} from './config.js'

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

export function getCachedProductAnalysis(urlString) {
  const cacheKey = getProductAnalysisCacheKey(urlString)
  const cached = productAnalysisCache.get(cacheKey)
  if (!cached) return null
  if (Date.now() - cached.createdAt > PRODUCT_ANALYSIS_CACHE_TTL_MS) {
    productAnalysisCache.delete(cacheKey)
    return null
  }
  return cached.value
}

export function cacheProductAnalysis(urlString, value) {
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

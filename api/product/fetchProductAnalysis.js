import {
  FALLBACK_WARNINGS,
  MAX_PRODUCT_URL_LENGTH,
  PRODUCT_ANALYSIS_CACHE_MAX,
  PRODUCT_ANALYSIS_CACHE_TTL_MS,
  PRODUCT_FETCH_HEADERS,
} from './config.js'
import {
  extractProductInfoFromHtml,
  isAccessChallengeHtml,
} from './htmlProduct.js'
import { decodeHtmlEntities, parseAttributes } from './htmlUtils.js'
import {
  buildProductContext,
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

function cacheFallbackProductAnalysis(url, reason, warning) {
  return cacheProductAnalysis(
    url,
    buildFallbackAnalysis(url, reason, warning),
  )
}

// -- product option group extraction (<select> and radio/checkbox groups) --

function normalizeOptionText(text) {
  return decodeHtmlEntities(String(text || ''))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractAssociatedLabel(html, inputId) {
  if (!inputId) return ''
  const escaped = inputId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const labelMatch = html.match(
    new RegExp(`<label\\b[^>]*for=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/label>`, 'i'),
  )
  return normalizeOptionText(labelMatch?.[1] || '')
}

function simplifyGroupLabel(rawLabel, fallback) {
  const text = normalizeOptionText(rawLabel || fallback)
  if (!text) return ''
  return text.replace(/\s*[:|·.-]\s*$/, '').trim()
}

function extractSelectOptionGroups(html) {
  const groups = []
  const selectRe = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi
  let selectMatch
  while ((selectMatch = selectRe.exec(html)) !== null) {
    const attrs = parseAttributes(selectMatch[1] || '')
    const body = selectMatch[2] || ''
    const groupLabel = simplifyGroupLabel(
      attrs['aria-label'] ||
        attrs['data-label'] ||
        extractAssociatedLabel(html, attrs.id) ||
        attrs.name ||
        attrs.id,
      '옵션',
    )

    const options = []
    const optionRe = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi
    let optionMatch
    while ((optionMatch = optionRe.exec(body)) !== null) {
      const optionAttrs = parseAttributes(optionMatch[1] || '')
      const label = normalizeOptionText(optionMatch[2] || optionAttrs.label || '')
      const value = normalizeOptionText(optionAttrs.value || label)
      const disabled = 'disabled' in optionAttrs
      if (!label || disabled) continue
      if (!value && !label) continue
      const isPlaceholder =
        !value ||
        /선택|choose|select|option|사이즈 선택|색상 선택|옵션 선택/i.test(label)
      if (isPlaceholder && options.length === 0) continue
      options.push({
        value: value || label,
        label,
      })
    }

    const uniqueOptions = []
    const seen = new Set()
    for (const option of options) {
      const key = `${option.value}::${option.label}`
      if (seen.has(key)) continue
      seen.add(key)
      uniqueOptions.push(option)
    }

    if (uniqueOptions.length >= 2) {
      groups.push({
        id: attrs.id || attrs.name || `select-${groups.length + 1}`,
        label: groupLabel,
        type: 'select',
        options: uniqueOptions.slice(0, 12),
      })
    }
  }
  return groups
}

function extractRadioOptionGroups(html) {
  const inputRe = /<input\b([^>]*\btype=["']?(?:radio|checkbox)["']?[^>]*)>/gi
  const grouped = new Map()
  let inputMatch
  while ((inputMatch = inputRe.exec(html)) !== null) {
    const attrs = parseAttributes(inputMatch[1] || '')
    const name = attrs.name || attrs.id
    if (!name) continue
    const label =
      normalizeOptionText(attrs['aria-label']) ||
      normalizeOptionText(attrs.title) ||
      extractAssociatedLabel(html, attrs.id) ||
      normalizeOptionText(attrs.value)
    if (!label) continue
    const groupLabel = simplifyGroupLabel(
      attrs['aria-label'] || extractAssociatedLabel(html, attrs.id) || attrs.name || attrs.id,
      '옵션',
    )
    const list = grouped.get(name) || {
      id: name,
      label: groupLabel,
      type: attrs.type || 'radio',
      options: [],
    }
    list.options.push({
      value: normalizeOptionText(attrs.value || label),
      label,
    })
    grouped.set(name, list)
  }

  return Array.from(grouped.values())
    .map((group) => {
      const seen = new Set()
      const options = []
      for (const option of group.options) {
        const key = `${option.value}::${option.label}`
        if (seen.has(key)) continue
        seen.add(key)
        options.push(option)
      }
      return { ...group, options: options.slice(0, 12) }
    })
    .filter((group) => group.options.length >= 2)
}

function extractProductOptionGroupsFromHtml(html) {
  return [...extractSelectOptionGroups(html), ...extractRadioOptionGroups(html)].slice(
    0,
    8,
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

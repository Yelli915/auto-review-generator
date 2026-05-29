const MAX_PRODUCT_URL_LENGTH = 2048
const MAX_PRODUCT_PAGE_BYTES = 512 * 1024
const PRODUCT_PAGE_TIMEOUT_MS = 6000
const READER_PAGE_TIMEOUT_MS = 10000
const READER_BASE_URL = 'https://r.jina.ai/'
const PRODUCT_ANALYSIS_CACHE_TTL_MS = 10 * 60 * 1000
const PRODUCT_ANALYSIS_CACHE_MAX = 80

const productAnalysisCache = new Map()
const fetchCacheScopes = new WeakMap()
let nextFetchCacheScope = 1

const FALLBACK_WARNINGS = {
  fetchFailed:
    '이 사이트는 본문 읽기가 제한되어 URL에서 추정한 정보만 사용합니다. 부족한 상품 정보는 직접 입력해 주세요.',
  httpBlocked:
    '상품 페이지 접근이 제한되어 URL에서 추정한 정보만 사용합니다. 부족한 상품 정보는 직접 입력해 주세요.',
  nonHtml: '상품 HTML을 읽을 수 없어 URL에서 추정한 정보만 사용합니다.',
  noMetadata:
    '페이지에서 상품 메타 정보를 찾지 못했습니다. 필요한 정보를 직접 입력해 주세요.',
  readFailed:
    '상품 페이지를 읽는 중 문제가 생겼습니다. URL에서 추정한 값 또는 직접 입력한 정보를 사용합니다.',
}

const PRODUCT_FETCH_HEADERS = {
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
}

const READER_FETCH_HEADERS = {
  Accept: 'text/plain, text/markdown;q=0.9, */*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
}

function normalizeProductUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { ok: false, status: 400, error: '상품 링크를 입력해 주세요.' }
  }

  const value = rawUrl.trim()
  if (value.length > MAX_PRODUCT_URL_LENGTH) {
    return { ok: false, status: 400, error: '상품 링크가 너무 깁니다.' }
  }

  let url
  try {
    url = new URL(value)
  } catch {
    return { ok: false, status: 400, error: '올바른 상품 링크를 입력해 주세요.' }
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return { ok: false, status: 400, error: 'http 또는 https 링크만 사용할 수 있습니다.' }
  }
  if (url.username || url.password) {
    return { ok: false, status: 400, error: '인증 정보가 포함된 링크는 사용할 수 없습니다.' }
  }

  const hostname = url.hostname.toLowerCase()
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1'
  ) {
    return { ok: false, status: 400, error: '공개 상품 페이지 링크만 사용할 수 있습니다.' }
  }

  return { ok: true, url: url.toString() }
}

function decodeHtmlEntities(text) {
  if (typeof text !== 'string') return ''
  const named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  }

  return text
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_, entity) => {
      const key = String(entity).toLowerCase()
      if (key.startsWith('#x')) {
        return String.fromCodePoint(Number.parseInt(key.slice(2), 16))
      }
      if (key.startsWith('#')) {
        return String.fromCodePoint(Number.parseInt(key.slice(1), 10))
      }
      return named[key] ?? ''
    })
    .replace(/\s+/g, ' ')
    .trim()
}

function extractMetaContent(html, selector) {
  const metaRe = /<meta\b([^>]*)>/gi
  let match
  while ((match = metaRe.exec(html)) !== null) {
    const attrs = parseAttributes(match[1] || '')
    const key = attrs.property || attrs.name
    if (key?.toLowerCase() === selector.toLowerCase() && attrs.content) {
      return decodeHtmlEntities(attrs.content)
    }
  }
  return ''
}

function extractTitle(html) {
  const ogTitle = extractMetaContent(html, 'og:title')
  if (ogTitle) return ogTitle
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  return decodeHtmlEntities(title || '')
}

function firstString(...values) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() || ''
}

function normalizeProductField(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function buildProductInfo({
  name = '',
  brand = '',
  imageUrl = '',
  price = '',
  description = '',
  site = '',
  url = '',
} = {}) {
  return {
    name: normalizeProductField(name),
    brand: normalizeProductField(brand),
    imageUrl: normalizeProductField(imageUrl),
    price: normalizeProductField(price),
    description: normalizeProductField(description),
    site: normalizeProductField(site),
    url: normalizeProductField(url),
  }
}

function hasUsefulProductInfo(product) {
  return Boolean(product?.name || product?.brand || product?.imageUrl || product?.price)
}

function normalizeJsonLdType(type) {
  if (Array.isArray(type)) return type.map((value) => String(value).toLowerCase())
  if (type) return [String(type).toLowerCase()]
  return []
}

function collectJsonLdNodes(value, nodes = []) {
  if (!value || typeof value !== 'object') return nodes
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonLdNodes(item, nodes))
    return nodes
  }

  nodes.push(value)
  collectJsonLdNodes(value['@graph'], nodes)
  return nodes
}

function parseJsonLdBlocks(html) {
  const blocks = []
  const scriptRe =
    /<script\b(?=[^>]*type=["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/gi
  let match
  while ((match = scriptRe.exec(html)) !== null) {
    const rawJson = decodeHtmlEntities(match[1] || '')
    if (!rawJson.trim()) continue
    try {
      blocks.push(JSON.parse(rawJson))
    } catch {
      void 0
    }
  }
  return blocks
}

function extractOfferPrice(offers) {
  const offerList = Array.isArray(offers) ? offers : [offers]
  for (const offer of offerList) {
    if (!offer || typeof offer !== 'object') continue
    const price = firstString(offer.price, offer.lowPrice, offer.highPrice)
    const currency = firstString(offer.priceCurrency)
    if (price && currency) return `${price} ${currency}`
    if (price) return price
  }
  return ''
}

function extractStructuredProductData(html) {
  const nodes = parseJsonLdBlocks(html).flatMap((block) => collectJsonLdNodes(block))
  const product = nodes.find((node) =>
    normalizeJsonLdType(node?.['@type']).includes('product'),
  )
  if (!product) return {}

  const brand =
    typeof product.brand === 'string'
      ? product.brand
      : firstString(product.brand?.name)
  return {
    name: firstString(product.name),
    description: firstString(product.description),
    brand,
    imageUrl: firstString(
      typeof product.image === 'string' ? product.image : '',
      product.image?.url,
      Array.isArray(product.image) ? product.image[0] : '',
    ),
    price: extractOfferPrice(product.offers),
  }
}

function extractProductInfoFromHtml(html, url) {
  const structured = extractStructuredProductData(html)
  const title = extractTitle(html) || structured.name
  const description =
    extractMetaContent(html, 'og:description') ||
    extractMetaContent(html, 'description') ||
    structured.description
  const site = extractMetaContent(html, 'og:site_name')
  const imageUrl =
    extractMetaContent(html, 'og:image') ||
    extractMetaContent(html, 'twitter:image') ||
    structured.imageUrl
  const price =
    extractMetaContent(html, 'product:price:amount') ||
    extractMetaContent(html, 'og:price:amount') ||
    extractMetaContent(html, 'twitter:data1') ||
    structured.price
  return buildProductInfo({
    name: title,
    brand: structured.brand,
    imageUrl,
    price,
    description,
    site,
    url,
  })
}

function buildProductContext(product, url) {
  const parts = [
    product?.site && `사이트: ${product.site}`,
    product?.name && `상품명: ${product.name}`,
    product?.brand && `브랜드: ${product.brand}`,
    product?.description && `설명: ${product.description}`,
    product?.price && `가격 정보: ${product.price}`,
    `링크: ${url}`,
  ].filter(Boolean)
  return parts.join('\n')
}

function productNameFromUrl(url) {
  const segments = url.pathname
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
  const lastMeaningfulSegment = [...segments]
    .reverse()
    .find((part) => !/^\d+$/.test(part) && !/^[a-f0-9-]{12,}$/i.test(part))

  if (!lastMeaningfulSegment) return ''

  try {
    return decodeURIComponent(lastMeaningfulSegment)
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[-_+]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  } catch {
    return lastMeaningfulSegment.replace(/[-_+]+/g, ' ').trim()
  }
}

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

function buildReaderUrl(urlString) {
  return `${READER_BASE_URL}${urlString}`
}

function cleanReaderText(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^URL Source:/i.test(line))
    .filter((line) => !/^Markdown Content:/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractReaderTitle(text) {
  const titleLine = String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^Title:\s*/i.test(line))
  return titleLine ? titleLine.replace(/^Title:\s*/i, '').trim() : ''
}

function buildReaderProductContext(text, urlString, reason = '') {
  const url = new URL(urlString)
  const title = extractReaderTitle(text)
  const cleaned = cleanReaderText(text)
    .replace(/^Title:\s*.*$/im, '')
    .trim()
  const summary = cleaned.slice(0, 1800).trim()
  const productName = productNameFromUrl(url)
  const parts = [
    `사이트: ${url.hostname}`,
    title && `페이지 제목: ${title}`,
    !title && productName && `상품명 추정: ${productName}`,
    reason && `직접 읽기 상태: ${reason}`,
    summary && `페이지 내용: ${summary}`,
    `링크: ${urlString}`,
  ].filter(Boolean)
  return parts.join('\n')
}

function buildReaderProductInfo(text, urlString) {
  const url = new URL(urlString)
  return buildProductInfo({
    name: extractReaderTitle(text) || productNameFromUrl(url),
    site: url.hostname,
    description: cleanReaderText(text)
      .replace(/^Title:\s*.*$/im, '')
      .trim()
      .slice(0, 600),
    url: urlString,
  })
}

async function fetchReaderProductAnalysis(urlString, reason = '') {
  let response
  try {
    response = await fetch(buildReaderUrl(urlString), {
      headers: READER_FETCH_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(READER_PAGE_TIMEOUT_MS),
    })
  } catch {
    return null
  }

  if (!response.ok) return null

  try {
    const text = await readResponseTextLimited(response)
    if (!text.trim()) return null
    return {
      ok: true,
      url: urlString,
      product: buildReaderProductInfo(text, urlString),
      analysisStatus: 'reader',
      warning: reason
        ? '상품 페이지 본문을 직접 읽지 못해 보조 읽기 방식으로 정보를 가져왔습니다.'
        : '',
      productContext: buildReaderProductContext(text, urlString, reason),
      optionGroups: [],
    }
  } catch {
    return null
  }
}

function normalizeOptionText(text) {
  return decodeHtmlEntities(String(text || ''))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseAttributes(attrText) {
  const attrs = {}
  const re = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>`]+)))?/g
  let match
  while ((match = re.exec(attrText || '')) !== null) {
    const key = match[1].toLowerCase()
    attrs[key] = match[2] ?? match[3] ?? match[4] ?? ''
  }
  return attrs
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

async function readResponseTextLimited(response) {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_PRODUCT_PAGE_BYTES) {
      throw new Error('상품 페이지가 너무 큽니다.')
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

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

function buildAnalysisResult({
  url,
  product,
  productContext,
  optionGroups = [],
  analysisStatus = 'ok',
  warning = '',
}) {
  return {
    ok: true,
    url,
    product,
    productContext,
    optionGroups,
    analysisStatus,
    warning,
    needsManualInput: !hasUsefulProductInfo(product),
  }
}

function buildFallbackAnalysis(url, reason, warning) {
  return buildAnalysisResult({
    url,
    product: buildFallbackProductInfo(url),
    productContext: buildFallbackProductContext(url, reason),
    analysisStatus: 'fallback',
    warning,
  })
}

export async function fetchProductAnalysis(rawUrl) {
  const normalized = normalizeProductUrl(rawUrl)
  if (!normalized.ok) return normalized
  const cached = getCachedProductAnalysis(normalized.url)
  if (cached) return cached

  let response
  try {
    response = await fetch(normalized.url, {
      headers: PRODUCT_FETCH_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(PRODUCT_PAGE_TIMEOUT_MS),
    })
  } catch {
    const readerAnalysis = await fetchReaderProductAnalysis(
      normalized.url,
      'direct fetch failed',
    )
    if (readerAnalysis) {
      return cacheProductAnalysis(normalized.url, readerAnalysis)
    }

    return cacheProductAnalysis(
      normalized.url,
      buildFallbackAnalysis(
        normalized.url,
        '서버에서 페이지를 직접 읽지 못했습니다.',
        FALLBACK_WARNINGS.fetchFailed,
      ),
    )
  }

  if (!response.ok) {
    const readerAnalysis = await fetchReaderProductAnalysis(
      normalized.url,
      `HTTP ${response.status}`,
    )
    if (readerAnalysis) {
      return cacheProductAnalysis(normalized.url, readerAnalysis)
    }

    return cacheProductAnalysis(
      normalized.url,
      buildFallbackAnalysis(
        normalized.url,
        `HTTP ${response.status} 응답으로 페이지 본문을 읽지 못했습니다.`,
        FALLBACK_WARNINGS.httpBlocked,
      ),
    )
  }

  const contentType = response.headers.get('content-type') || ''
  if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    return cacheProductAnalysis(
      normalized.url,
      buildFallbackAnalysis(
        normalized.url,
        'HTML 페이지가 아닌 응답입니다.',
        FALLBACK_WARNINGS.nonHtml,
      ),
    )
  }

  try {
    const html = await readResponseTextLimited(response)
    const product = extractProductInfoFromHtml(html, normalized.url)
    const productContext = buildProductContext(product, normalized.url)
    const hasInfo = hasUsefulProductInfo(product)
    return cacheProductAnalysis(
      normalized.url,
      buildAnalysisResult({
        url: normalized.url,
        product: hasInfo ? product : buildFallbackProductInfo(normalized.url),
        productContext:
          productContext.trim() ||
          buildFallbackProductContext(
            normalized.url,
            '페이지에서 상품 메타 정보를 찾지 못했습니다.',
          ),
        optionGroups: extractProductOptionGroupsFromHtml(html),
        analysisStatus: hasInfo ? 'ok' : 'fallback',
        warning: hasInfo ? '' : FALLBACK_WARNINGS.noMetadata,
      }),
    )
  } catch (err) {
    return cacheProductAnalysis(
      normalized.url,
      buildFallbackAnalysis(
        normalized.url,
        err instanceof Error ? err.message : '상품 정보를 읽지 못했습니다.',
        FALLBACK_WARNINGS.readFailed,
      ),
    )
  }
}

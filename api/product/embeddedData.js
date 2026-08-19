import {
  EMBEDDED_JSON_ASSIGNMENT_RE,
  EMBEDDED_JSON_SCRIPT_IDS,
  PRODUCT_FIELD_KEYS,
  PRODUCT_KEYWORDS_RE,
} from './config.js'
import { decodeHtmlEntities, parseAttributes } from './htmlUtils.js'
import {
  buildProductInfo,
  firstImageValue,
  firstValueByKeys,
  normalizeImageUrl,
} from './productInfo.js'
import { sliceBalancedSegment } from '../../shared/balancedText.js'

function collectScriptPayloads(html) {
  const payloads = []
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  let match
  while ((match = scriptRe.exec(html)) !== null) {
    const attrs = parseAttributes(match[1] || '')
    if ('src' in attrs) continue
    const body = decodeHtmlEntities(match[2] || '').trim()
    if (!body) continue
    const type = String(attrs.type || '').toLowerCase()
    const id = String(attrs.id || '')
    if (
      type.includes('json') ||
      EMBEDDED_JSON_SCRIPT_IDS.has(id) ||
      PRODUCT_KEYWORDS_RE.test(id)
    ) {
      payloads.push(body)
    }

    EMBEDDED_JSON_ASSIGNMENT_RE.lastIndex = 0
    let assignment
    while ((assignment = EMBEDDED_JSON_ASSIGNMENT_RE.exec(body)) !== null) {
      const start = body.slice(assignment.index + assignment[0].length).search(/[[{]/)
      if (start < 0) continue
      const jsonStart = assignment.index + assignment[0].length + start
      const jsonLike = sliceBalancedSegment(body, { startIndex: jsonStart })
      if (jsonLike) payloads.push(jsonLike)
    }
  }
  return payloads
}

function parseEmbeddedJsonPayload(payload) {
  if (typeof payload !== 'string' || !payload.trim()) return null
  const trimmed = payload.trim()
  const start = trimmed.search(/[[{]/)
  if (start < 0) return null
  const jsonLike = sliceBalancedSegment(trimmed, { startIndex: start })
  if (!jsonLike) return null

  try {
    return JSON.parse(jsonLike)
  } catch {
    return null
  }
}

function scoreProductCandidate(product, keyPath = '') {
  let score = 0
  if (product.name) score += 4
  if (product.brand) score += 2
  if (product.imageUrl) score += 2
  if (product.price) score += 2
  if (product.description) score += 1
  if (PRODUCT_KEYWORDS_RE.test(keyPath)) score += 2
  return score
}

function productInfoFromObject(value, pageUrl) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const imageRaw =
    firstImageValue(firstValueByKeys(value, PRODUCT_FIELD_KEYS.imageUrl)) ||
    firstImageValue(value.image) ||
    firstImageValue(value.images) ||
    firstImageValue(value.imageList) ||
    firstImageValue(value.goodsImages)
  const brandRaw =
    firstValueByKeys(value, PRODUCT_FIELD_KEYS.brand) ||
    firstValueByKeys(value.brand, ['name', 'brandName', 'brandNm'])

  return buildProductInfo({
    name: firstValueByKeys(value, PRODUCT_FIELD_KEYS.name),
    brand: brandRaw,
    imageUrl: normalizeImageUrl(imageRaw, pageUrl),
    price: firstValueByKeys(value, PRODUCT_FIELD_KEYS.price),
    description: firstValueByKeys(value, PRODUCT_FIELD_KEYS.description),
    url: pageUrl,
  })
}

function findBestEmbeddedProduct(value, pageUrl, keyPath = '', state = { best: null }) {
  if (!value || typeof value !== 'object') return state.best

  if (Array.isArray(value)) {
    value.slice(0, 80).forEach((item, index) => {
      findBestEmbeddedProduct(item, pageUrl, `${keyPath}[${index}]`, state)
    })
    return state.best
  }

  const product = productInfoFromObject(value, pageUrl)
  const score = scoreProductCandidate(product, keyPath)
  if (score > (state.best?.score || 0)) {
    state.best = { score, product }
  }

  for (const [key, child] of Object.entries(value)) {
    if (!child || typeof child !== 'object') continue
    findBestEmbeddedProduct(child, pageUrl, keyPath ? `${keyPath}.${key}` : key, state)
  }

  return state.best
}

export function extractEmbeddedProductData(html, pageUrl) {
  let best = null
  for (const payload of collectScriptPayloads(html)) {
    const parsed = parseEmbeddedJsonPayload(payload)
    if (!parsed) continue
    const candidate = findBestEmbeddedProduct(parsed, pageUrl)
    if (candidate && candidate.score > (best?.score || 0)) {
      best = candidate
    }
  }
  return best?.score >= 4 ? best.product : {}
}

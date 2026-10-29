import {
  EMBEDDED_JSON_ASSIGNMENT_RE,
  EMBEDDED_JSON_SCRIPT_IDS,
  PRODUCT_FIELD_KEYS,
  PRODUCT_KEYWORDS_RE,
} from './config.js'
import {
  decodeHtmlEntities,
  extractTitle,
  parseAttributes,
  readMetaTags,
  sliceBalancedSegment,
} from './htmlUtils.js'
import {
  buildProductInfo,
  firstImageValue,
  firstString,
  firstValueByKeys,
  normalizeImageUrl,
  isAccessChallengeText,
} from './productInfo.js'

// -- JSON-LD (structured data) extraction --

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

function tryParseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

// 페이지의 <script>를 한 번만 훑어 JSON-LD와 내장 JSON 추출이 같이 씁니다.
function readScripts(html) {
  return Array.from(html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi), (match) => ({
    attrs: parseAttributes(match[1] || ''),
    body: match[2] || '',
  }))
}

// <script> 안은 엔티티를 풀지 않는 원문이라 그대로 먼저 읽습니다. 본문 전체를 엔티티로 감싼 페이지만 풀어서 다시 읽습니다.
function parseJsonLdBlocks(scripts) {
  const blocks = []
  for (const { attrs, body: rawJson } of scripts) {
    if (String(attrs.type || '').trim().toLowerCase() !== 'application/ld+json') continue
    if (!rawJson.trim()) continue
    const block = tryParseJson(rawJson) ?? tryParseJson(decodeHtmlEntities(rawJson))
    if (block !== undefined) blocks.push(block)
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

function extractStructuredProductData(scripts) {
  const nodes = parseJsonLdBlocks(scripts).flatMap((block) => collectJsonLdNodes(block))
  const product = nodes.find((node) =>
    normalizeJsonLdType(node?.['@type']).includes('product'),
  )
  if (!product) return {}

  // JSON 문자열 값에 HTML 엔티티(&amp; 등)를 넣어 보내는 사이트가 많아 꺼낸 값만 풉니다.
  const text = (...values) => decodeHtmlEntities(firstString(...values))
  const brand =
    typeof product.brand === 'string'
      ? text(product.brand)
      : text(product.brand?.name)
  return {
    name: text(product.name),
    description: text(product.description),
    brand,
    imageUrl: text(
      typeof product.image === 'string' ? product.image : '',
      product.image?.url,
      Array.isArray(product.image) ? product.image[0] : '',
    ),
    price: extractOfferPrice(product.offers),
  }
}

// -- Embedded JSON (inline script payload) extraction --

function collectScriptPayloads(scripts) {
  const payloads = []
  for (const { attrs, body: rawBody } of scripts) {
    if ('src' in attrs) continue
    const body = decodeHtmlEntities(rawBody).trim()
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
      const jsonLike = sliceBalancedSegment(body, jsonStart)
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
  const jsonLike = sliceBalancedSegment(trimmed, start)
  return jsonLike ? tryParseJson(jsonLike) ?? null : null
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

  // 배열을 받으면 앞에서부터 처음 찾은 이미지를 씁니다.
  const imageRaw = firstImageValue([
    firstValueByKeys(value, PRODUCT_FIELD_KEYS.imageUrl),
    value.image,
    value.images,
    value.imageList,
    value.goodsImages,
  ])
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

function extractEmbeddedProductData(scripts, pageUrl) {
  let best = null
  for (const payload of collectScriptPayloads(scripts)) {
    const parsed = parseEmbeddedJsonPayload(payload)
    if (!parsed) continue
    const candidate = findBestEmbeddedProduct(parsed, pageUrl)
    if (candidate && candidate.score > (best?.score || 0)) {
      best = candidate
    }
  }
  return best?.score >= 4 ? best.product : {}
}

// -- HTML metadata extraction (orchestrates the strategies above) --

export function isAccessChallengeHtml(html) {
  if (typeof html !== 'string' || !html.trim()) return false
  return isAccessChallengeText(`${extractTitle(html)} ${html.slice(0, 6000)}`)
}

// 접근 차단 페이지인지는 호출하는 쪽(isAccessChallengeHtml)이 먼저 확인합니다.
export function extractProductInfoFromHtml(html, url) {
  const meta = readMetaTags(html)
  const metaContent = (key) => meta.get(key) || ''
  const scripts = readScripts(html)
  const structured = extractStructuredProductData(scripts)
  const embedded = extractEmbeddedProductData(scripts, url)
  const title = firstString(structured.name, embedded.name, extractTitle(html, meta))
  const description =
    metaContent('og:description') ||
    metaContent('description') ||
    structured.description ||
    embedded.description
  const site = metaContent('og:site_name')
  const imageUrl =
    metaContent('og:image') ||
    metaContent('twitter:image') ||
    structured.imageUrl ||
    embedded.imageUrl
  const price =
    metaContent('product:price:amount') ||
    metaContent('og:price:amount') ||
    metaContent('twitter:data1') ||
    structured.price ||
    embedded.price
  return buildProductInfo({
    name: title,
    brand: firstString(structured.brand, embedded.brand),
    imageUrl: normalizeImageUrl(imageUrl, url),
    price,
    description,
    site,
    url,
  })
}

// -- product option group extraction (<select> and radio/checkbox groups) --

function normalizeOptionText(text) {
  return decodeHtmlEntities(String(text || ''))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// <label for>를 처음 필요할 때 한 번만 훑어 id → 라벨 맵을 만듭니다. 입력마다 HTML 전체를 다시 훑지 않습니다.
function createLabelLookup(html) {
  let labels = null
  return (inputId) => {
    if (!inputId) return ''
    if (!labels) {
      labels = new Map()
      const labelRe = /<label\b([^>]*)>([\s\S]*?)<\/label>/gi
      let match
      while ((match = labelRe.exec(html)) !== null) {
        const target = parseAttributes(match[1] || '').for
        if (target && !labels.has(target)) labels.set(target, normalizeOptionText(match[2] || ''))
      }
    }
    return labels.get(inputId) || ''
  }
}

function simplifyGroupLabel(rawLabel, fallback) {
  const text = normalizeOptionText(rawLabel || fallback)
  if (!text) return ''
  return text.replace(/\s*[:|·.-]\s*$/, '').trim()
}

// value·label이 같은 옵션은 하나만 남기고 최대 12개까지 씁니다.
function uniqueOptions(options) {
  const seen = new Set()
  return options
    .filter((option) => {
      const key = `${option.value}::${option.label}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 12)
}

function extractSelectOptionGroups(html, labelFor) {
  const groups = []
  const selectRe = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi
  let selectMatch
  while ((selectMatch = selectRe.exec(html)) !== null) {
    const attrs = parseAttributes(selectMatch[1] || '')
    const body = selectMatch[2] || ''
    const groupLabel = simplifyGroupLabel(
      attrs['aria-label'] ||
        attrs['data-label'] ||
        labelFor(attrs.id) ||
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
      const isPlaceholder =
        !value ||
        /선택|choose|select|option|사이즈 선택|색상 선택|옵션 선택/i.test(label)
      if (isPlaceholder && options.length === 0) continue
      options.push({
        value: value || label,
        label,
      })
    }

    const unique = uniqueOptions(options)
    if (unique.length >= 2) {
      groups.push({
        id: attrs.id || attrs.name || `select-${groups.length + 1}`,
        label: groupLabel,
        type: 'select',
        options: unique,
      })
    }
  }
  return groups
}

function extractRadioOptionGroups(html, labelFor) {
  const inputRe = /<input\b([^>]*\btype=["']?(?:radio|checkbox)["']?[^>]*)>/gi
  const grouped = new Map()
  let inputMatch
  while ((inputMatch = inputRe.exec(html)) !== null) {
    const attrs = parseAttributes(inputMatch[1] || '')
    const name = attrs.name || attrs.id
    if (!name) continue
    const associatedLabel = labelFor(attrs.id)
    const label =
      normalizeOptionText(attrs['aria-label']) ||
      normalizeOptionText(attrs.title) ||
      associatedLabel ||
      normalizeOptionText(attrs.value)
    if (!label) continue
    const list = grouped.get(name) || {
      id: name,
      label: simplifyGroupLabel(
        attrs['aria-label'] || associatedLabel || attrs.name || attrs.id,
        '옵션',
      ),
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
    .map((group) => ({ ...group, options: uniqueOptions(group.options) }))
    .filter((group) => group.options.length >= 2)
}

export function extractProductOptionGroupsFromHtml(html) {
  const labelFor = createLabelLookup(html)
  return [
    ...extractSelectOptionGroups(html, labelFor),
    ...extractRadioOptionGroups(html, labelFor),
  ].slice(0, 8)
}

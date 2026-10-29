import { decodeHtmlEntities, tryParseJson } from './htmlUtils.js'
import { firstString } from './productInfo.js'

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

export function extractStructuredProductData(scripts) {
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

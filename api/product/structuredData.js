import { decodeHtmlEntities } from './htmlUtils.js'
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

export function extractStructuredProductData(html) {
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

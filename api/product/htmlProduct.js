import { isAccessChallengeText } from '../accessChallenge.js'
import { extractEmbeddedProductData } from './embeddedData.js'
import { extractMetaContent, extractTitle } from './htmlUtils.js'
import {
  buildProductInfo,
  firstString,
  normalizeImageUrl,
} from './productInfo.js'
import { extractStructuredProductData } from './structuredData.js'

export function isAccessChallengeHtml(html) {
  if (typeof html !== 'string' || !html.trim()) return false
  return isAccessChallengeText(`${extractTitle(html)} ${html.slice(0, 6000)}`)
}

export function extractProductInfoFromHtml(html, url) {
  if (isAccessChallengeHtml(html)) {
    return buildProductInfo({
      site: new URL(url).hostname,
      url,
    })
  }

  const structured = extractStructuredProductData(html)
  const embedded = extractEmbeddedProductData(html, url)
  const title = firstString(structured.name, embedded.name, extractTitle(html))
  const description =
    extractMetaContent(html, 'og:description') ||
    extractMetaContent(html, 'description') ||
    structured.description ||
    embedded.description
  const site = extractMetaContent(html, 'og:site_name')
  const imageUrl =
    extractMetaContent(html, 'og:image') ||
    extractMetaContent(html, 'twitter:image') ||
    structured.imageUrl ||
    embedded.imageUrl
  const price =
    extractMetaContent(html, 'product:price:amount') ||
    extractMetaContent(html, 'og:price:amount') ||
    extractMetaContent(html, 'twitter:data1') ||
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

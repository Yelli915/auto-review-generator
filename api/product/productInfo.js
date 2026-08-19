import { isAccessChallengeText } from './accessChallenge.js'

export function firstString(...values) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() || ''
}

export function firstValueByKeys(source, keys) {
  if (!source || typeof source !== 'object') return ''
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

export function firstImageValue(value) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value)) {
    for (const item of value) {
      const image = firstImageValue(item)
      if (image) return image
    }
    return ''
  }
  if (!value || typeof value !== 'object') return ''
  return firstValueByKeys(value, [
    'url',
    'src',
    'imageUrl',
    'imgUrl',
    'mainImgUrl',
    'thumbnail',
  ])
}

export function normalizeImageUrl(imageUrl, pageUrl) {
  if (typeof imageUrl !== 'string' || !imageUrl.trim()) return ''
  try {
    return new URL(imageUrl.trim(), pageUrl).toString()
  } catch {
    return imageUrl.trim()
  }
}

function normalizeProductField(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function buildProductInfo({
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

function isAccessChallengeProduct(product) {
  if (!product) return false
  return isAccessChallengeText(
    [product.name, product.brand, product.description, product.site].filter(Boolean).join(' '),
  )
}

export function hasUsefulProductInfo(product) {
  if (isAccessChallengeProduct(product)) return false
  return Boolean(product?.name || product?.brand || product?.imageUrl || product?.price)
}

export function buildProductContext(product, url) {
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

export function productNameFromUrl(url) {
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

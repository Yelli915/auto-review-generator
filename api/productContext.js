const MAX_PRODUCT_URL_LENGTH = 2048
const MAX_PRODUCT_PAGE_BYTES = 512 * 1024
const PRODUCT_PAGE_TIMEOUT_MS = 6000

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
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(
    `<meta\\b(?=[^>]*(?:name|property)=["']${escapedSelector}["'])(?=[^>]*content=["']([^"']+)["'])[^>]*>`,
    'i',
  )
  const match = html.match(re)
  return match ? decodeHtmlEntities(match[1]) : ''
}

function extractTitle(html) {
  const ogTitle = extractMetaContent(html, 'og:title')
  if (ogTitle) return ogTitle
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  return decodeHtmlEntities(title || '')
}

function extractProductContextFromHtml(html, url) {
  const title = extractTitle(html)
  const description =
    extractMetaContent(html, 'og:description') ||
    extractMetaContent(html, 'description')
  const site = extractMetaContent(html, 'og:site_name')
  const price =
    extractMetaContent(html, 'product:price:amount') ||
    extractMetaContent(html, 'twitter:data1')
  const parts = [
    site && `사이트: ${site}`,
    title && `상품명: ${title}`,
    description && `설명: ${description}`,
    price && `가격 정보: ${price}`,
    `링크: ${url}`,
  ].filter(Boolean)
  return parts.join('\n')
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

export async function fetchProductContext(rawUrl) {
  const normalized = normalizeProductUrl(rawUrl)
  if (!normalized.ok) return normalized

  let response
  try {
    response = await fetch(normalized.url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'AutoReviewGenerator/1.0',
      },
      signal: AbortSignal.timeout(PRODUCT_PAGE_TIMEOUT_MS),
    })
  } catch {
    return { ok: false, status: 422, error: '상품 링크를 읽을 수 없습니다.' }
  }

  if (!response.ok) {
    return { ok: false, status: 422, error: '상품 페이지 응답이 올바르지 않습니다.' }
  }
  const contentType = response.headers.get('content-type') || ''
  if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    return { ok: false, status: 415, error: 'HTML 상품 페이지 링크만 사용할 수 있습니다.' }
  }

  try {
    const html = await readResponseTextLimited(response)
    const productContext = extractProductContextFromHtml(html, normalized.url)
    if (!productContext.trim()) {
      return { ok: false, status: 422, error: '상품 정보를 찾을 수 없습니다.' }
    }
    return { ok: true, productContext }
  } catch (err) {
    return {
      ok: false,
      status: 422,
      error: err instanceof Error ? err.message : '상품 정보를 읽을 수 없습니다.',
    }
  }
}

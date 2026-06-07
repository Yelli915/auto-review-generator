import { validatePublicHttpUrl } from '../publicUrlGuard.js'
import {
  MAX_PRODUCT_URL_LENGTH,
  PRODUCT_PAGE_TIMEOUT_MS,
} from './config.js'

const MAX_PUBLIC_FETCH_REDIRECTS = 5
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const REDIRECT_BLOCKED_ERROR =
  '상품 페이지가 허용되지 않는 URL로 리다이렉트되었습니다.'
const TOO_MANY_REDIRECTS_ERROR =
  '상품 페이지 리다이렉트가 너무 많습니다.'

function buildRedirectUrl(location, baseUrl) {
  try {
    return new URL(location, baseUrl).toString()
  } catch {
    return ''
  }
}

async function validateProductFetchUrl(url, maxLength = MAX_PRODUCT_URL_LENGTH) {
  return validatePublicHttpUrl(url, {
    maxLength,
  })
}

export async function validateRenderedRequestUrl(url, cache = new Map()) {
  const key = String(url || '')
  if (cache.has(key)) return cache.get(key)

  const result = await validateProductFetchUrl(key)
  const allowed = Boolean(result.ok)
  cache.set(key, allowed)
  return allowed
}

export async function fetchPublicUrl(url, options = {}) {
  const {
    maxLength = MAX_PRODUCT_URL_LENGTH,
    timeoutMs = PRODUCT_PAGE_TIMEOUT_MS,
    ...fetchOptions
  } = options
  let currentUrl = url

  for (
    let redirectCount = 0;
    redirectCount <= MAX_PUBLIC_FETCH_REDIRECTS;
    redirectCount += 1
  ) {
    const validated = await validateProductFetchUrl(currentUrl, maxLength)
    if (!validated.ok) {
      return {
        ok: false,
        status: validated.status,
        error: redirectCount > 0 ? REDIRECT_BLOCKED_ERROR : validated.error,
      }
    }

    const response = await fetch(validated.url, {
      ...fetchOptions,
      redirect: 'manual',
      signal:
        fetchOptions.signal ||
        AbortSignal.timeout(timeoutMs),
    })

    if (!REDIRECT_STATUSES.has(response.status)) {
      return { ok: true, response, url: validated.url }
    }

    const location = response.headers.get('location') || ''
    const nextUrl = buildRedirectUrl(location, validated.url)
    if (!nextUrl) {
      return { ok: false, status: 400, error: REDIRECT_BLOCKED_ERROR }
    }
    currentUrl = nextUrl
  }

  return { ok: false, status: 400, error: TOO_MANY_REDIRECTS_ERROR }
}

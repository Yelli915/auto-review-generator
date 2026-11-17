import { Agent } from 'undici'
import { lookupPublicAddress, validatePublicHttpUrl } from '../publicUrlGuard.js'
import {
  MAX_PRODUCT_PAGE_BYTES,
  MAX_PRODUCT_URL_LENGTH,
  PRODUCT_PAGE_TIMEOUT_MS,
} from './config.js'

// 연결할 때마다 주소를 다시 검사하는 dispatcher. 리다이렉트도 모두 이 연결을 거칩니다.
export const PUBLIC_ONLY_DISPATCHER = new Agent({ connect: { lookup: lookupPublicAddress } })
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

// 주소 검사는 연결 직전 dispatcher(lookupPublicAddress)가 하므로 여기서 DNS를 따로 조회하지 않습니다.
async function validateProductFetchUrl(url, maxLength = MAX_PRODUCT_URL_LENGTH) {
  return validatePublicHttpUrl(url, {
    maxLength,
    resolveDns: false,
  })
}

export async function fetchPublicUrl(url, options = {}) {
  const {
    maxLength = MAX_PRODUCT_URL_LENGTH,
    timeoutMs = PRODUCT_PAGE_TIMEOUT_MS,
    ...fetchOptions
  } = options
  let currentUrl = url
  // 리다이렉트 전체가 한 번의 제한 시간을 나눠 쓰고, 호출자의 signal(전체 deadline)도 따릅니다.
  const timeout = AbortSignal.timeout(timeoutMs)
  const signal = fetchOptions.signal
    ? AbortSignal.any([fetchOptions.signal, timeout])
    : timeout

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
      signal,
      dispatcher: PUBLIC_ONLY_DISPATCHER,
    })

    if (!REDIRECT_STATUSES.has(response.status)) {
      return { ok: true, response, url: validated.url }
    }

    // 읽지 않은 본문이 소켓을 붙잡지 않도록 버립니다.
    await response.body?.cancel()
    const location = response.headers.get('location') || ''
    const nextUrl = buildRedirectUrl(location, validated.url)
    if (!nextUrl) {
      return { ok: false, status: 400, error: REDIRECT_BLOCKED_ERROR }
    }
    currentUrl = nextUrl
  }

  return { ok: false, status: 400, error: TOO_MANY_REDIRECTS_ERROR }
}

export async function readResponseTextLimited(response) {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_PRODUCT_PAGE_BYTES) {
      await reader.cancel()
      throw new Error('상품 페이지가 너무 큽니다.')
    }
    chunks.push(value)
  }

  return new Blob(chunks).text()
}

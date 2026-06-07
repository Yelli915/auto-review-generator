import { validatePublicHttpUrl } from '../publicUrlGuard.js'
import { MAX_PRODUCT_URL_LENGTH } from './config.js'

const PRODUCT_URL_REQUIRED_ERROR = '상품 링크를 입력해 주세요.'
const PRODUCT_URL_TOO_LONG_ERROR = '상품 링크가 너무 깁니다.'
const PUBLIC_PRODUCT_URL_ERROR =
  '공개된 http/https 상품 페이지 링크만 사용할 수 있습니다.'

export async function normalizeProductUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { ok: false, status: 400, error: PRODUCT_URL_REQUIRED_ERROR }
  }

  return validatePublicHttpUrl(rawUrl, {
    errorMessage: PUBLIC_PRODUCT_URL_ERROR,
    maxLength: MAX_PRODUCT_URL_LENGTH,
    tooLongError: PRODUCT_URL_TOO_LONG_ERROR,
  })
}

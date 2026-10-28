/* global process */

export function getTrimmedEnv(name) {
  return typeof process.env[name] === 'string' ? process.env[name].trim() : ''
}

export const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024
export const RATE_LIMIT_WINDOW_MS = 60 * 1000
export const RATE_LIMIT_MAX_REQUESTS = 20
// action별 하루 요청 한도. 상품 분석은 외부 페이지를 읽으므로 따로 제한합니다.
export const DAILY_USAGE_LIMITS = {
  keywords: 20,
  review: 20,
  'analyze-product': 60,
}
export const USAGE_STORE_KEY_PREFIX = 'auto-review-generator'
export const DEBUG_LOGS =
  process.env.NODE_ENV !== 'production' || process.env.DEBUG_LOGS === '1'

/* global process */

export function getTrimmedEnv(name) {
  return typeof process.env[name] === 'string' ? process.env[name].trim() : ''
}

export const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024
export const RATE_LIMIT_WINDOW_MS = 60 * 1000
export const RATE_LIMIT_MAX_REQUESTS = 20
export const DAILY_USAGE_MAX_REQUESTS = 20
export const DAILY_USAGE_ACTIONS = new Set(['keywords', 'review'])
export const USAGE_STORE_KEY_PREFIX = 'auto-review-generator'
export const DEBUG_LOGS =
  process.env.NODE_ENV !== 'production' || process.env.DEBUG_LOGS === '1'

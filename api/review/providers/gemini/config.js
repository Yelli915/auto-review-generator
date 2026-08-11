export const MODEL = 'gemini-2.5-flash'
export const RETRYABLE_STATUS = new Set([500, 502, 503, 504])
export const MAX_RETRIES = 2
export const KEYWORDS_MAX_OUTPUT_TOKENS = 1024
export const REVIEW_MAX_OUTPUT_TOKENS = {
  short: 2048,
  medium: 3072,
  long: 4096,
}

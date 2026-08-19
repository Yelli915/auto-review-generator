/* global process */

export function getTrimmedEnv(name) {
  return typeof process.env[name] === 'string' ? process.env[name].trim() : ''
}

export const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024
export const MAX_IMAGE_BYTES = 1536 * 1024
export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])
export const RATE_LIMIT_WINDOW_MS = 60 * 1000
export const RATE_LIMIT_MAX_REQUESTS = 20
export const DAILY_USAGE_MAX_REQUESTS = 20
export const DAILY_USAGE_ACTIONS = new Set(['keywords', 'review'])
export const USAGE_STORE_KEY_PREFIX = 'auto-review-generator'
export const KEYWORDS_MIN_COUNT = 3
export const KEYWORDS_MAX_COUNT = 8
export const KEYWORD_LEN_MIN = 2
export const KEYWORD_LEN_MAX = 30
export const KEYWORD_RETRY_LIMIT = 3
export const DEBUG_LOGS =
  process.env.NODE_ENV !== 'production' || process.env.DEBUG_LOGS === '1'

export const COSMETIC_CONTEXT_RE =
  /화장품|뷰티|스킨|로션|크림|수분|보습|앰플|세럼|에센스|토너|선크림|자외선|클렌징|쿠션|파운데이션|컨실러|립|틴트|마스카라|아이섀도|블러셔|향|발림성|흡수|밀착|끈적임|마무리감|지속력|피부/
export const CONTAINER_CENTERED_KEYWORD_RE =
  /용기|케이스|패키지|패키징|포장|병|튜브|펌프|캡|뚜껑|스포이드|콤팩트|리필통/
export const CONTAINER_REVIEW_EXCEPTION_RE =
  /누수|샘|흐름|파손|깨짐|불량|고장|위생|휴대|밀봉|보관|잠금|리필|소분/

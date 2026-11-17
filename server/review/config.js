import { normalizeReviewCategory } from '../../shared/reviewCategories.js'

// -- Gemini --
export const MODEL = 'gemini-2.5-flash'
export const RETRYABLE_STATUS = new Set([500, 502, 503, 504])
export const MAX_RETRIES = 2
export const KEYWORDS_MAX_OUTPUT_TOKENS = 1024
export const REVIEW_MAX_OUTPUT_TOKENS = {
  short: 2048,
  medium: 3072,
  long: 4096,
  xlong: 6144,
}

export const MAX_IMAGE_BYTES = 1536 * 1024
export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])
export const KEYWORDS_MIN_COUNT = 3
export const KEYWORDS_MAX_COUNT = 8
export const KEYWORD_RETRY_LIMIT = 3
// vercel.json maxDuration(60s)보다 여유 있게 짧아야 합니다.
export const KEYWORDS_DEADLINE_MS = 50000

const GENERIC_BAN_PHRASES_PLACE = [
  '분위기 좋음',
  '깔끔함',
  '만족',
  '가성비',
  '무난함',
]
const GENERIC_BAN_PHRASES_PRODUCT = [
  '좋음',
  '깔끔함',
  '만족',
  '가성비',
  '무난함',
]

export function getGenericBanPhrases(category) {
  return normalizeReviewCategory(category) === 'place'
    ? GENERIC_BAN_PHRASES_PLACE
    : GENERIC_BAN_PHRASES_PRODUCT
}

export const COSMETIC_CONTEXT_RE =
  /화장품|뷰티|스킨|로션|크림|수분|보습|앰플|세럼|에센스|토너|선크림|자외선|클렌징|쿠션|파운데이션|컨실러|립|틴트|마스카라|아이섀도|블러셔|향|발림성|흡수|밀착|끈적임|마무리감|지속력|피부/
export const CONTAINER_CENTERED_KEYWORD_RE =
  /용기|케이스|패키지|패키징|포장|병|튜브|펌프|캡|뚜껑|스포이드|콤팩트|리필통/
export const CONTAINER_REVIEW_EXCEPTION_RE =
  /누수|샘|흐름|파손|깨짐|불량|고장|위생|휴대|밀봉|보관|잠금|리필|소분/

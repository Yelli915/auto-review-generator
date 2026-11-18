const DEFAULT_REVIEW_LENGTH = 'medium'
const DEFAULT_REVIEW_TONE = 'neutral'
const SPARSE_LONG_REVIEW_KEYWORD_MIN = 3

export const REVIEW_LENGTH_OPTIONS = [
  {
    value: 'short',
    label: '짧게',
    promptLabel: '30자 이상으로 간결하게',
    minChars: 30,
  },
  {
    value: 'medium',
    label: '보통',
    promptLabel: '60자 이상으로 자연스럽게',
    minChars: 60,
  },
  {
    value: 'long',
    label: '길게',
    promptLabel: '90자 이상으로 자세하게',
    minChars: 90,
  },
  {
    value: 'xlong',
    label: '아주 길게',
    promptLabel: '200자 이상으로 상세하게',
    minChars: 200,
  },
]

export const REVIEW_TONE_OPTIONS = [
  {
    value: 'neutral',
    label: '기본',
  },
  {
    value: 'friendly',
    label: '친근',
  },
  {
    value: 'formal',
    label: '격식',
  },
  {
    value: 'casual',
    label: '반말',
  },
]

const REVIEW_LENGTH_MAP = REVIEW_LENGTH_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option
  return acc
}, {})

const REVIEW_TONE_MAP = REVIEW_TONE_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option
  return acc
}, {})

export function normalizeReviewLength(value) {
  return REVIEW_LENGTH_MAP[value] ? value : DEFAULT_REVIEW_LENGTH
}

export function normalizeReviewTone(value) {
  return REVIEW_TONE_MAP[value] ? value : DEFAULT_REVIEW_TONE
}

export function getReviewLengthPrompt(value) {
  return REVIEW_LENGTH_MAP[normalizeReviewLength(value)].promptLabel
}

export function getReviewMinChars(value) {
  return REVIEW_LENGTH_MAP[normalizeReviewLength(value)].minChars
}

export function isSparseLongReview(length, keywordCount) {
  const count = Number(keywordCount)
  return (
    ['long', 'xlong'].includes(normalizeReviewLength(length)) &&
    Number.isFinite(count) &&
    count > 0 &&
    count < SPARSE_LONG_REVIEW_KEYWORD_MIN
  )
}

const DEFAULT_REVIEW_RATING = 5
const MIN_REVIEW_RATING = 1
const MAX_REVIEW_RATING = 5

export function normalizeReviewRating(value) {
  const rating = Number(value)
  if (!Number.isFinite(rating)) return DEFAULT_REVIEW_RATING
  return Math.max(MIN_REVIEW_RATING, Math.min(MAX_REVIEW_RATING, rating))
}

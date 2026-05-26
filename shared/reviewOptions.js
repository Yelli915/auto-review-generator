export const DEFAULT_REVIEW_LENGTH = 'medium'
export const DEFAULT_REVIEW_TONE = 'neutral'
export const SPARSE_LONG_REVIEW_KEYWORD_MIN = 3

export const REVIEW_LENGTH_OPTIONS = [
  {
    value: 'short',
    label: '짧게',
    controlLabel: '짧게 (최소 30자)',
    promptLabel: '30자 이상으로 간결하게',
    minChars: 30,
  },
  {
    value: 'medium',
    label: '보통',
    controlLabel: '보통 (최소 60자)',
    promptLabel: '60자 이상으로 자연스럽게',
    minChars: 60,
  },
  {
    value: 'long',
    label: '길게',
    controlLabel: '길게 (최소 90자)',
    promptLabel: '90자 이상으로 자세하게',
    minChars: 90,
  },
]

export const REVIEW_TONE_OPTIONS = [
  {
    value: 'neutral',
    label: '기본',
    controlLabel: '기본 (자연스럽게)',
  },
  {
    value: 'friendly',
    label: '친근',
    controlLabel: '친근 (친구처럼)',
  },
  {
    value: 'formal',
    label: '격식',
    controlLabel: '격식 (정중하게)',
  },
  {
    value: 'casual',
    label: '반말',
    controlLabel: '반말 (편하게)',
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
    normalizeReviewLength(length) === 'long' &&
    Number.isFinite(count) &&
    count > 0 &&
    count < SPARSE_LONG_REVIEW_KEYWORD_MIN
  )
}

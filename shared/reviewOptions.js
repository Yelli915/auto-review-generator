export const DEFAULT_REVIEW_LENGTH = 'medium'
export const DEFAULT_REVIEW_TONE = 'neutral'

export const REVIEW_LENGTH_OPTIONS = [
  {
    value: 'short',
    label: '짧게',
  },
  {
    value: 'medium',
    label: '보통',
  },
  {
    value: 'long',
    label: '길게',
  },
]

export const REVIEW_LENGTH_MIN_CHARS = {
  short: 60,
  medium: 100,
  long: 160,
}

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

export const REVIEW_LENGTH_MAP = REVIEW_LENGTH_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option
  return acc
}, {})

export const REVIEW_TONE_MAP = REVIEW_TONE_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option
  return acc
}, {})

export function normalizeReviewLength(value) {
  return REVIEW_LENGTH_MAP[value] ? value : DEFAULT_REVIEW_LENGTH
}

export function getReviewMinChars(value) {
  return REVIEW_LENGTH_MIN_CHARS[normalizeReviewLength(value)]
}

export function normalizeReviewTone(value) {
  return REVIEW_TONE_MAP[value] ? value : DEFAULT_REVIEW_TONE
}

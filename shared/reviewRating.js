export const DEFAULT_REVIEW_RATING = 5
export const MIN_REVIEW_RATING = 1
export const MAX_REVIEW_RATING = 5

export function normalizeReviewRating(value) {
  const rating = Number(value)
  if (!Number.isFinite(rating)) return DEFAULT_REVIEW_RATING
  return Math.max(MIN_REVIEW_RATING, Math.min(MAX_REVIEW_RATING, rating))
}

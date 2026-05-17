export function hasHangul(s) {
  return /[\uAC00-\uD7A3]/.test(s)
}

export function isLikelyKeywordPhrase(value) {
  if (typeof value !== 'string') return false
  const s = value.trim()
  if (!s) return false
  if (/[,:;!?]/.test(s)) return false
  if (/['"`]/.test(s)) return false
  if (/\s{2,}/.test(s)) return false
  if (s.split(/\s+/).length > 4) return false
  if (/(습니다|해요|했어요|입니다|있어요|없어요|같아요|괜찮|추천해요|빠르게|시간)$/u.test(s)) {
    return false
  }
  return true
}

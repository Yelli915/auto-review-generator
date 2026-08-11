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
  if (/(모델|프롬프트|지시문|시스템|응답|출력|사진 분석|이미지 분석|제품 인식|인식 과정|분석 과정|판단 과정|과정 서술|과정을 서술|누수 문제)/u.test(s)) {
    return false
  }
  if (/(확인|점검|검토|분석|판단|인식|서술)(하기)?$/u.test(s)) {
    return false
  }
  if (/(하기|확인하기|점검하기|서술하기|분석하기|판단하기|인식하기)$/u.test(s)) {
    return false
  }
  if (/(습니다|해요|했어요|입니다|있어요|없어요|같아요|괜찮|추천해요|빠르게|시간)$/u.test(s)) {
    return false
  }
  return true
}

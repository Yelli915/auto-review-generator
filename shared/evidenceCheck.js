// 리뷰에서 입력 근거(상품 정보·직접 경험·키워드)에 없는 숫자·영문 토큰을 찾습니다.
// 화면(초안의 "근거에 없는 내용" 표시)과 eval(환각 채점)이 같이 씁니다.
// ponytail: 규칙 기반이라 "촉촉한 제형" 같은 근거 없는 서술은 못 잡음. 필요하면 LLM 근거-문장 대조를 추가.
const NUMBER_RE = /\d[\d,.]*/g
const LATIN_RE = /[A-Za-z][A-Za-z0-9&'-]*/g

export function findUnsupportedTokens(review, sourceText) {
  if (typeof review !== 'string' || !review) return []
  const source = String(sourceText ?? '').replace(/,/g, '').toLowerCase()
  const numbers = (review.match(NUMBER_RE) ?? [])
    .map((n) => n.replace(/[,.]+$/, '').replace(/,/g, ''))
    .filter((n) => n && !source.includes(n))
  const latin = (review.match(LATIN_RE) ?? []).filter((w) => !source.includes(w.toLowerCase()))
  return [...new Set([...numbers, ...latin])]
}

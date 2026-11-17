// 상품 정보를 프롬프트 근거용 텍스트로 만듭니다. 서버 분석 결과·대체 결과·화면에서 보완한 상품 정보가 모두 이 형식을 씁니다.
// notes: 상품 필드 뒤, 링크 앞에 넣을 추가 줄("상품명 추정: …", "페이지 수집 상태: …" 등). 빈 값은 건너뜁니다.
export function formatProductContext(product, url = product?.url, notes = []) {
  return [
    product?.site && `사이트: ${product.site}`,
    product?.name && `상품명: ${product.name}`,
    product?.brand && `브랜드: ${product.brand}`,
    product?.description && `설명: ${product.description}`,
    product?.price && `가격 정보: ${product.price}`,
    ...notes,
    url && `링크: ${url}`,
  ]
    .filter(Boolean)
    .join('\n')
}

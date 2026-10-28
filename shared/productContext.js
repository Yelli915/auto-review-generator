// 상품 정보를 프롬프트 근거용 텍스트로 만듭니다. 서버 분석 결과와 화면에서 보완한 상품 정보가 같은 형식을 씁니다.
export function formatProductContext(product, url = product?.url) {
  return [
    product?.site && `사이트: ${product.site}`,
    product?.name && `상품명: ${product.name}`,
    product?.brand && `브랜드: ${product.brand}`,
    product?.description && `설명: ${product.description}`,
    product?.price && `가격 정보: ${product.price}`,
    url && `링크: ${url}`,
  ]
    .filter(Boolean)
    .join('\n')
}

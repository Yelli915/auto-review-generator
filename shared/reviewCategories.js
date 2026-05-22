export const DEFAULT_REVIEW_CATEGORY = 'place'
export const MAX_REVIEW_IMAGE_COUNT = 3

export const REVIEW_CATEGORY_OPTIONS = [
  {
    value: 'place',
    label: '장소',
    focus:
      '공간, 분위기, 청결, 접근성, 직원 응대, 이용 흐름, 가격 대비 만족도, 재방문 의사 중심. 음식점이면 맛·양·메뉴 인상, 숙소면 침구·방음·체크인 같은 단서를 이미지와 키워드에 맞게 자연스럽게 반영',
    avoid:
      '사진이나 키워드로 확인되지 않는 정확한 메뉴명, 가격, 주소, 방문 시점, 객실명, 담당자 실명, 보장되지 않은 결과는 만들지 말 것',
  },
  {
    value: 'product',
    label: '상품',
    focus: '품질, 디자인, 사용감, 마감, 구성, 가성비 중심',
    avoid: '실제 사용 기간, 배송 속도, 브랜드명, 가격은 확인되지 않으면 만들지 말 것',
  },
]

const LEGACY_REVIEW_CATEGORY_MAP = {
  restaurant: 'place',
  accommodation: 'place',
  service: 'place',
}

export const REVIEW_CATEGORY_MAP = REVIEW_CATEGORY_OPTIONS.reduce(
  (acc, option) => {
    acc[option.value] = option
    return acc
  },
  {},
)

export const REVIEW_CATEGORY_LABELS = REVIEW_CATEGORY_OPTIONS.reduce(
  (acc, option) => {
    acc[option.value] = option.label
    return acc
  },
  {},
)

export function normalizeReviewCategory(value) {
  const nextValue = LEGACY_REVIEW_CATEGORY_MAP[value] ?? value
  return REVIEW_CATEGORY_MAP[nextValue] ? nextValue : DEFAULT_REVIEW_CATEGORY
}

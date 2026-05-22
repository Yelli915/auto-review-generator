export const DEFAULT_REVIEW_CATEGORY = 'place'
export const MAX_REVIEW_IMAGE_COUNT = 3

export const REVIEW_CATEGORY_OPTIONS = [
  {
    value: 'place',
    label: '장소',
    focus: '공간 분위기, 청결, 위치 인상, 편의성, 응대, 재방문 의사 중심',
    avoid: '사진에서 확인되지 않는 정확한 주소, 방문 날짜, 담당자 실명은 만들지 말 것',
  },
  {
    value: 'product',
    label: '상품',
    focus: '품질, 디자인, 사용감, 마감, 구성, 가성비 중심',
    avoid: '실제 사용 기간, 배송 속도, 브랜드명, 가격은 확인되지 않으면 만들지 말 것',
  },
]

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
  return REVIEW_CATEGORY_MAP[value] ? value : DEFAULT_REVIEW_CATEGORY
}

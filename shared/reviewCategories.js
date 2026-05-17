export const DEFAULT_REVIEW_CATEGORY = 'restaurant'
export const MAX_REVIEW_IMAGE_COUNT = 3

export const REVIEW_CATEGORY_OPTIONS = [
  {
    value: 'restaurant',
    label: '맛집',
    focus: '맛, 메뉴 인상, 양, 분위기, 친절, 재방문 의사 중심',
    avoid: '사진만으로 알 수 없는 정확한 메뉴명, 가격, 방문 시점은 단정하지 말 것',
  },
  {
    value: 'product',
    label: '상품',
    focus: '품질, 디자인, 사용감, 마감, 구성, 가성비 중심',
    avoid: '실제 사용 기간, 배송 속도, 브랜드명, 가격은 확인되지 않으면 만들지 말 것',
  },
  {
    value: 'accommodation',
    label: '숙소',
    focus: '청결, 위치 인상, 공간 분위기, 편의시설, 소음, 체크인 경험 중심',
    avoid: '방문하지 않은 시설, 정확한 주소, 날짜, 객실명은 단정하지 말 것',
  },
  {
    value: 'service',
    label: '서비스',
    focus: '응대, 속도, 전문성, 설명의 충분함, 만족도, 재이용 의사 중심',
    avoid: '담당자 실명, 정확한 처리 시간, 보장되지 않은 결과는 만들지 말 것',
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

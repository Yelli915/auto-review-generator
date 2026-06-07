export const DEFAULT_REVIEW_CATEGORY = 'place'
export const DEFAULT_REVIEW_SUBCATEGORY = ''
export const MAX_REVIEW_IMAGE_COUNT = 3

export const REVIEW_SUBCATEGORY_OPTIONS = {
  place: [
    {
      value: 'restaurant',
      label: '음식점',
      focus: '음식의 맛, 온도, 양, 플레이팅, 대기, 좌석, 직원 응대',
      avoid: '확인되지 않은 메뉴명, 원산지, 조리 방식, 방문 날짜',
    },
    {
      value: 'cafe',
      label: '카페',
      focus: '음료와 디저트, 좌석, 조명, 소음, 콘센트, 머무르기 편한 정도',
      avoid: '확인되지 않은 원두, 제조 방식, 영업 시간',
    },
    {
      value: 'stay',
      label: '숙소',
      focus: '객실 상태, 청결, 침구, 소음, 위치, 체크인 경험, 편의시설',
      avoid: '확인되지 않은 객실 등급, 부대시설, 예약 가격',
    },
    {
      value: 'service',
      label: '병원/미용/서비스',
      focus: '응대, 설명의 친절함, 대기, 시설 청결, 절차의 편안함',
      avoid: '확인되지 않은 치료 효과, 시술 결과, 의료적 효능',
    },
    {
      value: 'general-place',
      label: '일반 장소',
      focus: '공간 분위기, 동선, 접근성, 청결, 이용 편의성',
      avoid: '확인되지 않은 정확한 주소, 운영 시간, 요금',
    },
  ],
  product: [
    {
      value: 'beauty',
      label: '뷰티',
      focus: '제형, 발림성, 향, 마무리감, 지속력, 피부에 닿는 느낌',
      avoid: '확인되지 않은 미백, 주름 개선, 치료 효과',
    },
    {
      value: 'fashion',
      label: '패션',
      focus: '핏, 소재감, 색감, 마감, 착용감, 사이즈 체감',
      avoid: '확인되지 않은 세탁 내구성, 실제 브랜드 가치',
    },
    {
      value: 'electronics',
      label: '전자기기',
      focus: '조작감, 소음, 반응 속도, 배터리 체감, 연결성, 마감',
      avoid: '확인되지 않은 장기 내구성, 정확한 성능 수치',
    },
    {
      value: 'daily',
      label: '생활용품',
      focus: '크기, 무게, 수납, 설치, 청소, 반복 사용 편의성',
      avoid: '확인되지 않은 장기 내구성, 안전 인증',
    },
    {
      value: 'food',
      label: '식품',
      focus: '맛, 식감, 향, 양, 포장 상태, 조리나 보관 편의성',
      avoid: '확인되지 않은 건강 효능, 원재료 함량',
    },
    {
      value: 'general-product',
      label: '기타 상품',
      focus: '구성, 마감, 사용감, 크기, 무게, 옵션',
      avoid: '확인되지 않은 배송 속도, 장기 내구성, 가격 우위',
    },
  ],
}

export const REVIEW_CATEGORY_OPTIONS = [
  {
    value: 'place',
    label: '장소',
    focus: '공간 분위기, 청결, 위치 인상, 직원 응대, 이용 동선 중심',
    avoid: '사진이나 입력 정보에서 확인되지 않는 정확한 주소, 방문 날짜, 매장명, 메뉴명은 만들지 않기',
    subcategories: REVIEW_SUBCATEGORY_OPTIONS.place,
  },
  {
    value: 'product',
    label: '상품',
    focus: '내용물 상태, 색감, 질감, 사용감, 디자인, 마감, 구성, 옵션 중심',
    avoid: '실제 사용 기간, 배송 속도, 브랜드명, 가격은 확인되지 않으면 만들지 않기',
    subcategories: REVIEW_SUBCATEGORY_OPTIONS.product,
  },
]

export const REVIEW_CATEGORY_MAP = REVIEW_CATEGORY_OPTIONS.reduce(
  (acc, option) => {
    acc[option.value] = option
    return acc
  },
  {},
)

export const REVIEW_SUBCATEGORY_MAP = Object.entries(
  REVIEW_SUBCATEGORY_OPTIONS,
).reduce((acc, [category, options]) => {
  acc[category] = options.reduce((optionAcc, option) => {
    optionAcc[option.value] = option
    return optionAcc
  }, {})
  return acc
}, {})

export function normalizeReviewCategory(value) {
  return REVIEW_CATEGORY_MAP[value] ? value : DEFAULT_REVIEW_CATEGORY
}

export function normalizeReviewSubcategory(category, value) {
  const safeCategory = normalizeReviewCategory(category)
  if (!value) return DEFAULT_REVIEW_SUBCATEGORY
  return REVIEW_SUBCATEGORY_MAP[safeCategory]?.[value]
    ? value
    : DEFAULT_REVIEW_SUBCATEGORY
}

export function getReviewSubcategoryMeta(category, value) {
  const safeCategory = normalizeReviewCategory(category)
  const safeSubcategory = normalizeReviewSubcategory(safeCategory, value)
  return safeSubcategory
    ? REVIEW_SUBCATEGORY_MAP[safeCategory][safeSubcategory]
    : null
}

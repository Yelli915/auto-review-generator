export const MAX_PRODUCT_URL_LENGTH = 2048
export const MAX_PRODUCT_PAGE_BYTES = 512 * 1024
export const PRODUCT_PAGE_TIMEOUT_MS = 6000
export const READER_PAGE_TIMEOUT_MS = 10000
export const READER_BASE_URL = 'https://r.jina.ai/'
export const PRODUCT_ANALYSIS_CACHE_TTL_MS = 10 * 60 * 1000
export const PRODUCT_ANALYSIS_CACHE_MAX = 80

export const PRODUCT_FETCH_HEADERS = {
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
}

export const READER_FETCH_HEADERS = {
  Accept: 'text/plain, text/markdown;q=0.9, */*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
}

export const FALLBACK_WARNINGS = {
  fetchFailed:
    '이 사이트는 본문 읽기가 제한되어 URL에서 추정한 정보만 사용합니다. 부족한 상품 정보는 직접 입력해 주세요.',
  httpBlocked:
    '상품 페이지 접근이 제한되어 URL에서 추정한 정보만 사용합니다. 부족한 상품 정보는 직접 입력해 주세요.',
  nonHtml: '상품 HTML을 읽을 수 없어 URL에서 추정한 정보만 사용합니다.',
  noMetadata:
    '페이지에서 상품 메타 정보를 찾지 못했습니다. 필요한 정보를 직접 입력해 주세요.',
  readFailed:
    '상품 페이지를 읽는 중 문제가 생겼습니다. URL에서 추정한 값 또는 직접 입력한 정보를 사용합니다.',
  rendered:
    '상품 페이지가 로딩 후 표시되는 구조라 브라우저 렌더링 결과에서 정보를 가져왔습니다.',
}

export const EMBEDDED_JSON_SCRIPT_IDS = new Set([
  '__NEXT_DATA__',
  '__NUXT_DATA__',
  '__remixContext',
  '__APOLLO_STATE__',
])

export const EMBEDDED_JSON_ASSIGNMENT_RE =
  /(?:window\.|globalThis\.|self\.)?(?:__INITIAL_STATE__|__PRELOADED_STATE__|__NEXT_DATA__|__NUXT__|__APOLLO_STATE__|__PRODUCT_DATA__|__GOODS_DATA__)\s*=\s*/gi

export const PRODUCT_KEYWORDS_RE = /product|goods|item|prd|sku|상품|goodsNo/i

export const PRODUCT_FIELD_KEYS = {
  name: [
    'goodsNm',
    'goodsName',
    'goodsDispNm',
    'productName',
    'prdNm',
    'itemName',
    'dispGoodsNm',
    'name',
    'title',
  ],
  brand: [
    'brandNm',
    'brandName',
    'brndNm',
    'brndName',
    'brandKorNm',
    'brand',
    'makerName',
  ],
  imageUrl: [
    'imageUrl',
    'imgUrl',
    'mainImg',
    'mainImgUrl',
    'goodsImg',
    'goodsImgUrl',
    'productImage',
    'repImage',
    'thumbnail',
    'thumbUrl',
  ],
  price: [
    'price',
    'salePrice',
    'finalPrice',
    'goodsPrice',
    'originalPrice',
    'listPrice',
    'salePrc',
    'goodsPrc',
    'lowPrice',
  ],
  description: [
    'description',
    'desc',
    'goodsDesc',
    'productDesc',
    'summary',
    'shortDescription',
  ],
}

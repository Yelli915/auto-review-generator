# Product URL Analysis Cases

상품 URL 분석은 public URL 검증을 통과한 주소만 처리하며, HTML metadata, JSON-LD, embedded data, reader fallback, rendered fallback 순서로 상품 맥락을 확보합니다.

## 성공 케이스

### HTML metadata 분석

조건:

- 상품 페이지가 public URL입니다.
- HTML에 `og:title`, `og:description` 같은 metadata가 있습니다.

기대 결과:

- `ok: true`
- `analysisStatus: ok`
- 상품명과 설명을 `productContext`에 반영
- 옵션 후보가 있으면 `optionGroups`에 반영

### JSON-LD 분석

조건:

- page meta tag가 부족하지만 JSON-LD Product 구조가 있습니다.

기대 결과:

- `ok: true`
- JSON-LD의 상품명, 이미지, 브랜드, 가격, 설명을 추출
- 추출한 상품 정보가 키워드 생성과 리뷰 프롬프트에 전달

### embedded data 분석

조건:

- 클라이언트 렌더링용 초기 상태에 상품 데이터가 포함되어 있습니다.
- 예: `__NEXT_DATA__`, `__NUXT_DATA__`, `__APOLLO_STATE__`, `__PRODUCT_DATA__`

기대 결과:

- `ok: true`
- embedded JSON에서 상품 필드를 탐색
- URL만으로 부족한 맥락을 보완

## fallback 케이스

### direct fetch 차단 후 reader fallback

조건:

- 상품 페이지가 HTTP 403 등으로 직접 접근을 차단합니다.
- reader fallback이 텍스트/마크다운 본문을 반환합니다.

기대 결과:

- `ok: true`
- `analysisStatus: fallback`
- reader 결과의 제목과 본문 일부를 `productContext`에 반영
- 부족한 정보가 있으면 사용자가 직접 보완

### access challenge page

조건:

- 페이지가 실제 상품 본문 대신 `Just a moment...` 같은 접근 확인 페이지를 반환합니다.

기대 결과:

- `ok: true`
- `analysisStatus: fallback`
- `needsManualInput: true`
- 접근 확인 페이지 제목을 상품명으로 오인하지 않음

## 차단 케이스

### private network URL

조건:

- `http://10.0.0.5/products/1`처럼 사설망 주소를 입력합니다.

기대 결과:

- `ok: false`
- `status: 400`
- fetch를 실행하기 전에 차단

### private network redirect

조건:

- 최초 URL은 public URL이지만 redirect 대상이 사설망 주소입니다.

기대 결과:

- `ok: false`
- `status: 400`
- redirect 대상 검증에서 차단

### reader fallback redirect 차단

조건:

- reader fallback 응답이 사설망 주소로 redirect합니다.

기대 결과:

- public URL 검증 실패
- 상품 분석은 fallback 상태로 유지
- 위험한 redirect를 따라가지 않음

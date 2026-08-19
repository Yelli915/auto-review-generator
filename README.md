# Auto Review Generator

사진, 상품 링크, 별점, 리뷰 분야를 바탕으로 한국어 리뷰 초안을 생성하는 React + Gemini 기반 AI 웹 서비스 프로젝트입니다.

![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?style=flat-square&logo=javascript)
![Gemini](https://img.shields.io/badge/Gemini_2.5_Flash-4285F4?style=flat-square&logo=google)

## 프로젝트 소개

리뷰 작성이 번거로운 사용자를 위해 사진, 상품 링크, 별점, 경험 메모를 구조화하고 한국어 리뷰 초안을 생성하는 웹 애플리케이션입니다. 단순히 AI 응답을 화면에 출력하는 데서 끝내지 않고, 프롬프트 설계, 스트리밍 UX, Google 인증, 입력 검증, SSRF 방어, rate limit, 배포 환경 검증까지 포함해 실제 서비스 형태에 가깝게 구현했습니다.

## 문제 정의

사용자는 리뷰에 필요한 사진, 별점, 구매 정보, 사용 경험은 가지고 있지만 이를 자연스럽고 플랫폼에 맞는 문장으로 정리하는 데 부담을 느낍니다. 특히 상품 리뷰는 상품명, 브랜드, 옵션 같은 맥락이 필요하고, 장소 리뷰는 분위기, 동선, 응대, 청결 같은 관찰 정보가 필요해 단순 문장 생성만으로는 품질을 유지하기 어렵습니다.

## 해결 방식

- 사진과 상품 URL에서 리뷰 작성에 필요한 맥락을 추출합니다.
- 장소/상품 분야와 하위 분야에 따라 프롬프트 조건과 금지 정보를 분기합니다.
- 별점 기반으로 긍정, 중립, 부정 뉘앙스를 조절합니다.
- 사용자가 키워드, 길이, 말투, 수정 지시를 선택해 결과를 제어할 수 있습니다.
- Gemini 응답을 스트리밍으로 표시해 대기 시간을 체감상 줄입니다.
- Google ID Token 검증, Origin 제한, 이미지 검증, public URL 검증, rate limit으로 API 남용과 보안 리스크를 줄입니다.

## 핵심 차별점

- 상품 URL 분석과 이미지 기반 리뷰 생성을 결합했습니다.
- 생성형 AI 서비스에서 자주 빠지는 인증, 비용 제어, 입력 검증, SSRF 방어를 README와 테스트 범위에 명시했습니다.
- 서버리스 API, 프론트엔드 단계형 UI, 스트리밍 응답 처리를 하나의 사용자 흐름으로 연결했습니다.
- Vercel Production 배포 전 필수 환경 변수를 검증하는 빌드 가드를 포함했습니다.

## 현재 상태

현재 구현은 Google 로그인, 이미지 기반 리뷰 생성, 상품 URL 분석, 상품 옵션 확인, 키워드 선택, 스트리밍 리뷰 생성, 사용량 제한, 배포 환경 검증을 포함합니다.

기본 흐름:

```text
1. Google 로그인
2. 리뷰 분야 선택: 장소 또는 상품
3. 사진 업로드/편집 또는 상품 링크 입력
4. 별점과 사용자 경험 입력
5. 상품 URL이 있으면 상품 정보와 옵션 확인
6. 키워드, 리뷰 길이, 말투 선택
7. Gemini 스트리밍 응답으로 리뷰 생성
8. 리뷰 복사, 재생성, 수정 지시로 다시 작성
```

## 입력/출력 예시

예시 입력:

```text
분야: 상품 / 뷰티
별점: 4점
상품 링크: 올리브영 상품 URL
사용자 경험: 향은 좋은데 지속력은 보통이고, 발림감은 끈적이지 않았음
선택 키워드: 촉촉함, 향, 발림감, 지속력, 재구매 고민
길이/말투: 보통 / 기본
```

예시 출력:

```text
향이 은은하게 남아서 첫인상은 꽤 좋았고, 발림감도 끈적이지 않아 데일리로 쓰기 편했습니다.
바른 직후에는 촉촉한 느낌이 잘 느껴졌지만 지속력은 기대보다 평범한 편이라 중간에 한 번 더 덧발라야 했습니다.
향과 사용감은 마음에 들어서 재구매를 고민하게 되는 제품입니다.
```

수정 지시 예시:

```text
조금 더 짧고 자연스럽게 바꿔줘.
```

수정 후 출력:

```text
향이 은은하고 발림감이 끈적이지 않아 데일리로 쓰기 좋았습니다.
촉촉함은 괜찮았지만 지속력은 보통이라 중간에 덧바르는 게 좋았습니다.
전체적으로 사용감이 좋아 재구매를 고민하게 됩니다.
```

## 스크린샷

현재 저장된 UI 스크린샷 파일은 없습니다. 포트폴리오 제출 전에는 `docs/screenshots/`에 아래 화면을 캡처해 추가하는 것을 권장합니다.

- 로그인 후 첫 화면
- 리뷰 분야 선택 화면
- 이미지 업로드/편집 화면
- 상품 URL 분석 결과와 옵션 선택 화면
- 키워드, 길이, 말투 선택 화면
- 스트리밍 리뷰 생성 결과 화면

## 성능 및 분석 지표

최근 로컬 검증과 브라우저 측정 결과입니다.

| 항목 | 결과 |
| --- | --- |
| 테스트 | 97 tests 통과 |
| 테스트 파일 | 11 files |
| production build | 통과, 700 ms |
| JS bundle gzip | 77.55 kB |
| CSS bundle gzip | 6.63 kB |
| 로그인 전 첫 화면 wall time | 603 ms |
| DOMContentLoaded | 470 ms |
| first paint | 480 ms |

현재 셸에 `GEMINI_API_KEY`가 없어 실제 Gemini 리뷰 생성의 첫 chunk 표시 시간과 전체 생성 시간은 아직 측정하지 않았습니다.

## 상품 URL 분석 케이스

상품 URL 분석은 HTML metadata, JSON-LD, embedded data, reader fallback, rendered fallback 순서로 상품 맥락을 확보합니다.

대표 케이스:

- HTML metadata 또는 JSON-LD가 있으면 상품명, 브랜드, 가격, 이미지, 설명을 추출합니다.
- 직접 fetch가 차단되면 reader fallback으로 제목과 본문 일부를 확보합니다.
- access challenge page는 상품 정보로 오인하지 않고 수동 입력이 필요한 상태로 처리합니다.
- 사설망 URL과 사설망 redirect는 fetch 전 또는 redirect 검증 단계에서 차단합니다.

## 주요 기능

- 장소 리뷰와 상품 리뷰를 구분해 분야별 문체와 금지 정보를 반영합니다.
- 음식점, 카페, 숙소, 서비스, 일반 장소와 뷰티, 패션, 전자기기, 생활용품, 식품, 일반 상품 하위 분야를 지원합니다.
- 최대 3개의 이미지를 업로드하고 미리보기, 삭제, 순서 변경, 회전/자르기 편집을 할 수 있습니다.
- 상품 URL에서 상품명, 브랜드, 이미지, 가격, 설명, 옵션 후보를 추출합니다.
- 상품 URL 분석이 불완전하면 사용자가 상품 정보를 직접 보완할 수 있습니다.
- 별점에 따라 긍정, 중립, 부정 뉘앙스를 조절합니다.
- 키워드는 전체 선택/해제와 새로고침을 지원합니다.
- 리뷰 길이는 짧게, 보통, 길게를 지원하고 말투는 기본, 친근, 격식, 반말을 지원합니다.
- Gemini 응답을 스트리밍으로 표시해 생성 과정을 실시간으로 확인할 수 있습니다.
- Google OAuth ID Token 기반으로 API 요청을 인증합니다.
- Origin 제한, JSON 요청 크기 제한, 이미지 MIME/base64/signature/크기 검증, rate limit, 일일 사용량 제한을 적용합니다.
- 상품 URL 분석에서 사설망 URL, 위험한 redirect, 인증 정보가 포함된 URL을 차단합니다.
- Upstash Redis가 설정되면 서버리스 환경에서도 공유 rate limit과 일일 사용량 카운터를 유지합니다.
- Vercel/Netlify 보안 헤더와 Vercel 환경 변수 검증 스크립트를 포함합니다.

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| Frontend | React 19 |
| Build Tool | Vite |
| Language | JavaScript ES2022+, ESM |
| Styling | CSS Variables, 분리된 CSS 파일 |
| API | Vercel Serverless Functions 호환 Node.js API |
| Runtime | Node.js 20.x |
| AI | Google Gemini 2.5 Flash |
| Auth | Google OAuth ID Token verification |
| Product Analysis | HTML metadata, JSON-LD, embedded data, reader fallback, optional rendered fallback |
| Tests | Node.js built-in `node:test` |
| Deployment | Vercel, Netlify static config, Nginx security header sample |

## 프로젝트 구조

```text
auto-review-generator/
├─ api/
│  ├─ gemini.js                  # /api/gemini 진입점(Vercel 라우트)과 public export
│  ├─ review/                    # 인증, rate limit, 리뷰 생성 오케스트레이션, 이미지 검증 (provider 무관)
│  │  ├─ http/                   # 요청/응답 저수준 유틸(JSON 응답, 본문 파싱, client IP 추출)
│  │  ├─ keywords/                # 키워드 생성 오케스트레이션, 파싱, 필터링, 정규화
│  │  └─ providers/gemini/       # Gemini 전용 클라이언트와 모델 설정
│  ├─ product/                   # 상품 URL 검증, HTML/JSON-LD/embedded data/reader 분석 및 진입점(fetchProductAnalysis)
│  ├─ prompts.js                 # 키워드/리뷰 프롬프트 생성
│  └─ *.test.js
├─ shared/
│  ├─ httpJson.js
│  ├─ reviewCategories.js
│  ├─ reviewOptions.js
│  └─ reviewRating.js
├─ src/
│  ├─ App.jsx                    # Google 로그인과 인증 상태 관리
│  ├─ main.jsx
│  ├─ index.css                  # CSS entry
│  ├─ styles/                    # base, layout, upload, keyword, image editor CSS
│  └─ components/ReviewGenerator/
│     ├─ ReviewGenerator.jsx     # 단계별 화면 조립
│     ├─ api/                    # 클라이언트 API 호출과 스트림 파싱
│     ├─ hooks/                  # 리뷰 생성 플로우와 업로드 상태 관리
│     ├─ steps/                  # 분야, 업로드, 옵션, 키워드, 리뷰 단계
│     └─ utils/                  # 이미지 처리, 업로드/상품 옵션 유틸
├─ deploy/nginx/security-headers.conf
├─ scripts/verify-vercel-env.js
├─ vercel.json
├─ netlify.toml
└─ package.json
```

## 환경 변수

`.env.example`을 참고해 로컬 또는 배포 환경에 필요한 값을 설정합니다.

```env
GEMINI_API_KEY=
ALLOWED_ORIGINS=
GOOGLE_CLIENT_ID=
VITE_GOOGLE_CLIENT_ID=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
API_AUTH_TOKEN=
```

필수 변수:

- `GEMINI_API_KEY`: 서버에서 Gemini API를 호출할 때 사용하는 키입니다.
- `GOOGLE_CLIENT_ID`: API가 Google ID Token의 audience를 검증할 때 사용합니다.
- `VITE_GOOGLE_CLIENT_ID`: 브라우저에 노출되는 Google OAuth 클라이언트 ID입니다.
- `ALLOWED_ORIGINS`: API 요청을 허용할 프론트엔드 Origin 목록입니다. 쉼표로 여러 개를 지정할 수 있습니다.

선택 변수:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `API_AUTH_TOKEN`: Google OAuth 대신 서버 간 호출을 보호해야 할 때 사용하는 토큰입니다. 브라우저 사용자 플로우에서는 Google OAuth 설정을 우선 사용합니다.

Upstash 변수를 설정하면 rate limit과 일일 사용량 카운터가 Redis에 저장됩니다. 설정하지 않으면 로컬 테스트와 소규모 개인 사용에 적합한 인메모리 제한으로 동작하지만, 서버리스 인스턴스 간 공유되지는 않습니다.

운영 환경에서는 `GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID`, `ALLOWED_ORIGINS`, `GEMINI_API_KEY`가 필요합니다. 안정적인 비용 제어가 필요하면 Upstash 변수도 함께 설정하세요.

## 설치 및 실행

```bash
npm install
npm run dev
```

Vite 개발 서버에서 프론트엔드만 실행할 수 있습니다. 서버리스 API까지 로컬에서 확인하려면 Vercel 환경 변수를 가져온 뒤 실행합니다.

```bash
vercel env pull .env.local
npm run dev:vercel
```

`.env.local`은 git에 커밋하지 않습니다.

## 검증 명령

```bash
npm test
npm run lint
npm run build
```

최근 검증 결과:

| 명령 | 결과 |
| --- | --- |
| `npm test` | 통과: 97 tests, 11 test files, duration 2.24s |
| `npm run lint` | 통과 |
| `npm run build` | 통과: Vite production build 700ms |

빌드 산출물:

| 파일 | 크기 | gzip |
| --- | ---: | ---: |
| `dist/index.html` | 0.64 kB | 0.37 kB |
| `dist/assets/index-*.css` | 31.33 kB | 6.63 kB |
| `dist/assets/index-*.js` | 246.20 kB | 77.55 kB |

현재 테스트 범위:

- Gemini 핸들러의 `ping`, action 라우팅, 오류 응답
- Google 인증, Origin 제한, client IP 추출
- rate limit, 일일 사용량 제한, Upstash fallback
- 이미지 MIME, base64, signature, 크기 검증
- 키워드 생성, 중복 회피, 워터마크/필터링, JSON 파싱
- 리뷰 프롬프트와 Gemini 오류 메시지 변환
- 상품 URL 분석, HTML metadata, JSON-LD, embedded data, reader fallback
- private network URL과 private network redirect 차단
- 리뷰 스트림 파싱
- 이미지 편집 유틸
- Vercel/Netlify 배포 설정 동기화

## 보안 및 제한

- Gemini API 키는 서버리스 API에서만 사용합니다.
- 클라이언트는 Google ID Token을 `Authorization: Bearer` 헤더로 전달합니다.
- 서버는 ID Token의 audience를 `GOOGLE_CLIENT_ID`로 검증합니다.
- 운영 환경에서는 `ALLOWED_ORIGINS`에 포함된 Origin만 API 호출을 허용합니다.
- JSON 요청 본문은 최대 2MB로 제한합니다.
- 클라이언트 원본 이미지 파일은 개별 15MB 이하로 제한합니다.
- 서버로 전달되는 디코딩 이미지 크기는 이미지당 1.5MB 이하로 제한합니다.
- 허용 이미지 MIME 타입은 `image/jpeg`, `image/png`, `image/webp`입니다.
- 상품 URL은 public `http/https`만 허용하며 `localhost`, 사설망, metadata host, 인증 정보가 포함된 URL은 차단합니다.
- 상품 URL redirect와 reader fallback redirect도 public URL 검증을 다시 통과해야 합니다.
- 브라우저 렌더링 fallback은 Playwright 네트워크 요청을 검사해 public URL 검증을 통과한 요청만 허용합니다.
- `keywords`, `review` 요청에는 사용자 또는 IP 기준 rate limit과 일일 사용량 제한을 적용합니다.
- `ping`과 상품 URL 분석 요청은 일일 Gemini 사용량 제한 대상이 아닙니다.

## 배포

- Vercel: `vercel.json` 기준으로 정적 빌드와 `/api/gemini` 서버리스 API를 함께 배포합니다.
- Netlify: `netlify.toml` 기준으로 정적 빌드와 보안 헤더를 설정합니다. 현재 `/api/gemini`는 Vercel Functions 호환 API이므로 Netlify 단독 배포에서는 리뷰 생성 API를 별도로 연결해야 합니다.
- Nginx: `deploy/nginx/security-headers.conf`는 자체 호스팅 시 참고할 수 있는 보안 헤더 예시입니다.

`npm run build`는 `scripts/verify-vercel-env.js`를 먼저 실행합니다. 로컬 빌드는 운영 secrets 없이도 통과하지만, Vercel Production 빌드에서는 필수 환경 변수가 없으면 배포 전에 실패하도록 구성되어 있습니다.

## 문제 해결

- `401`: Google 로그인이 없거나 ID Token이 만료되었습니다. 다시 로그인하세요.
- `403`: 요청 Origin이 `ALLOWED_ORIGINS`에 포함되어 있지 않습니다.
- `413`: 요청 본문 또는 서버로 전달된 이미지가 크기 제한을 초과했습니다.
- `415`: 지원하지 않는 이미지 형식입니다. JPG, PNG, WEBP를 사용하세요.
- `429`: 서버 rate limit, 일일 사용량 제한, 또는 Gemini quota 제한입니다. `Retry-After`가 있으면 해당 시간 이후 다시 시도하세요.
- 상품 URL 분석 실패: 사이트가 본문 읽기를 차단했거나 HTML/metadata를 읽을 수 없습니다. 상품명, 브랜드, 설명을 직접 입력하세요.
- 리뷰가 너무 짧게 생성됨: 키워드를 더 선택하거나 리뷰 길이를 조정한 뒤 다시 생성하세요.

## License

MIT

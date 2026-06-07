# Auto Review Generator

사진, 상품 링크, 별점, 리뷰 분야를 바탕으로 한국어 리뷰 초안을 생성하는 React + Gemini 기반 웹 애플리케이션입니다.

![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?style=flat-square&logo=javascript)
![Gemini](https://img.shields.io/badge/Gemini_2.5_Flash-4285F4?style=flat-square&logo=google)

## 현재 상태

현재 구현은 Google 로그인, 이미지 기반 리뷰 생성, 상품 URL 분석, 사용량 제한, 배포 환경 검증까지 포함합니다.

기본 흐름:

```text
1. Google 로그인
2. 리뷰 분야 선택: 장소 또는 상품
3. 사진 업로드/편집 또는 상품 링크 입력
4. 별점 선택
5. 상품 정보와 옵션 확인
6. 키워드, 리뷰 길이, 말투 선택
7. Gemini 스트리밍 응답으로 리뷰 생성
8. 리뷰 복사, 재생성, 처음부터 다시 작성
```

## 주요 기능

- 장소 리뷰와 상품 리뷰를 구분해 키워드와 리뷰 문체를 생성
- 최대 3장 이미지 업로드, 미리보기, 삭제, 자르기, 회전 편집
- 상품 URL에서 상품명, 브랜드, 이미지, 가격, 설명, 옵션 후보 추출
- URL 분석이 불완전한 경우 상품 정보를 직접 보완
- 별점에 따라 긍정, 중립, 부정 뉘앙스 반영
- 키워드 재생성, 전체 선택/해제, 리뷰 길이와 말투 선택
- Gemini 리뷰 응답을 스트리밍으로 실시간 표시
- Google OAuth ID Token 기반 API 인증
- Origin 제한, 이미지 검증, 요청 크기 제한, rate limit, 일일 사용량 제한
- 상품 URL 분석 시 private network URL과 위험한 redirect 차단
- Upstash Redis를 통한 서버리스 환경의 공유 사용량 저장소 지원
- Vercel/Netlify 보안 헤더와 빌드 설정 검증 테스트

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| Frontend | React 19 |
| Build Tool | Vite |
| Language | JavaScript ES2022+, ESM |
| Styling | CSS Variables, 분리된 CSS 모듈 파일 |
| API | Vercel Serverless Functions 호환 Node.js API |
| Runtime | Node.js 20.x |
| AI | Google Gemini 2.5 Flash |
| Auth | Google OAuth ID Token verification |
| Tests | Node.js built-in `node:test` |
| Deployment | Vercel, Netlify static config |

## 프로젝트 구조

```text
auto-review-generator/
├─ api/
│  ├─ gemini.js                  # /api/gemini 진입점과 public export
│  ├─ gemini/                    # 인증, rate limit, Gemini 호출, 스트리밍, 이미지 검증
│  ├─ productContext.js          # 상품 URL 분석 public export
│  ├─ product/                   # 상품 URL 검증, HTML/JSON-LD/embedded data/reader 분석
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
│     ├─ hooks/                  # 리뷰 생성 플로우 상태 관리
│     ├─ steps/                  # 카테고리, 업로드, 옵션, 키워드, 리뷰 단계
│     └─ utils/                  # 이미지 처리, 업로드 유틸, 상품 옵션 유틸
├─ docs/
│  └─ vercel-environment.md
├─ deploy/nginx/security-headers.conf
├─ scripts/verify-vercel-env.js
├─ vercel.json
├─ netlify.toml
└─ package.json
```

## 환경 변수

```env
GEMINI_API_KEY=
ALLOWED_ORIGINS=
GOOGLE_CLIENT_ID=
VITE_GOOGLE_CLIENT_ID=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
API_AUTH_TOKEN=
```

운영 환경에서는 `GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID`, `ALLOWED_ORIGINS`, `GEMINI_API_KEY`가 필요합니다. Production에서 안정적인 비용 제어가 필요하면 Upstash 변수도 설정합니다. 각 변수의 역할과 Vercel 설정 방법은 [docs/vercel-environment.md](docs/vercel-environment.md)를 참고하세요.

`API_AUTH_TOKEN`은 Google OAuth 대신 서버 간 호출을 보호해야 할 때 사용할 수 있는 선택 변수입니다. 브라우저 사용자 플로우에서는 Google OAuth 설정을 우선 사용합니다.

## 설치 및 실행

```bash
npm install
npm run dev
```

Vercel 서버리스 API까지 로컬에서 확인하려면 Vercel 환경 변수를 가져온 뒤 실행합니다.

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

현재 테스트 범위:

- Gemini 핸들러, ping, action 라우팅
- Google 인증, Origin 제한, client IP 추출
- rate limit, 일일 사용량 제한, Upstash fallback
- 이미지 MIME/base64/signature/크기 검증
- 키워드 생성, 중복 회피, 필터링, JSON 파싱
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
- 운영 환경에서는 `ALLOWED_ORIGINS`에 포함된 Origin만 API 호출이 허용됩니다.
- JSON 요청 본문은 2MB로 제한합니다.
- 클라이언트 원본 이미지 파일은 각 15MB 이하로 제한합니다.
- 서버로 전달되는 디코딩 이미지 크기는 이미지당 1.5MB 이하로 제한합니다.
- 허용 이미지 MIME 타입은 `image/jpeg`, `image/png`, `image/webp`입니다.
- 상품 URL은 public `http/https`만 허용하며 `localhost`, 사설망, metadata host, 인증 정보 포함 URL을 차단합니다.
- 상품 URL redirect와 reader fallback redirect도 매 단계 public URL 검증을 다시 통과해야 합니다.
- 브라우저 렌더링 fallback은 Playwright 네트워크 요청을 검사해 내부망 요청을 abort합니다.
- `keywords`, `review` 요청은 사용자 또는 IP 기준으로 rate limit과 일일 사용량 제한을 적용합니다.
- `ping` 요청과 상품 URL 분석 요청은 일일 Gemini 사용량 제한 대상이 아닙니다.

## 배포

- Vercel: `vercel.json` 기준으로 정적 빌드와 `/api/gemini` 서버리스 API를 함께 배포합니다.
- Netlify: `netlify.toml` 기준으로 정적 빌드와 보안 헤더를 설정합니다. 현재 `/api/gemini`은 Vercel Functions 호환 API이므로 Netlify 단독 배포에서는 리뷰 생성 API를 별도로 연결해야 합니다.
- Nginx: `deploy/nginx/security-headers.conf`는 자체 호스팅 시 참고할 보안 헤더 예시입니다.

`npm run build`는 `scripts/verify-vercel-env.js`를 먼저 실행합니다. 로컬 빌드는 운영 secrets 없이도 통과하지만, Vercel Production 빌드에서는 필수 환경 변수가 없으면 배포 전에 실패하도록 구성되어 있습니다.

## 문제 해결

- `401`: Google 로그인이 없거나 ID Token이 만료되었습니다. 다시 로그인하세요.
- `403`: 요청 Origin이 `ALLOWED_ORIGINS`에 포함되어 있지 않습니다.
- `413`: 요청 본문 또는 서버로 전달된 이미지가 크기 제한을 초과했습니다.
- `415`: 지원하지 않는 이미지 형식입니다. JPG, PNG, WEBP를 사용하세요.
- `429`: 서버 rate limit, 일일 사용량 제한, 또는 Gemini quota 제한입니다. `Retry-After`가 있으면 해당 시간 이후 다시 시도하세요.
- 상품 URL 분석 실패: 사이트가 차단되었거나 HTML/metadata를 읽을 수 없습니다. 상품명 또는 설명을 직접 입력하세요.
- 리뷰가 너무 짧게 생성됨: 키워드를 더 선택하거나 리뷰 길이를 조정한 뒤 다시 생성하세요.

## License

MIT

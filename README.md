# Auto Review Generator

사진과 별점, 리뷰 분야를 바탕으로 한국어 리뷰 초안을 생성하는 React + Gemini 기반 웹 애플리케이션입니다.

![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?style=flat-square&logo=javascript)
![Gemini](https://img.shields.io/badge/Gemini_2.5_Flash-4285F4?style=flat-square&logo=google)

## 버전 정리

### ver1: 기본 리뷰 생성 MVP

사진 1장과 별점을 입력하면 Gemini가 사진을 분석해 리뷰 키워드를 만들고, 사용자가 선택한 키워드로 리뷰 초안을 생성하는 기본 버전입니다.

- 이미지 업로드
- 별점 선택
- 이미지 기반 키워드 자동 생성
- 키워드 선택 후 리뷰 생성
- 생성된 리뷰 클립보드 복사
- Gemini API 호출을 서버리스 API로 분리

### ver2: 사용성 및 품질 개선

MVP 흐름을 유지하면서 실제 사용에 필요한 입력 옵션, 이미지 처리, 생성 안정성을 보강한 버전입니다.

- 최대 3장 이미지 업로드
- 리뷰 분야 선택
- 장소 리뷰와 상품 리뷰 지원
- 이미지별 미리보기 제공
- 이미지 자르기 비율 선택
- 이미지 90도 회전 편집
- 리뷰 길이 선택
  - 짧게
  - 보통
  - 길게
- 말투 선택
  - 기본
  - 친근
  - 격식
  - 반말
- 키워드 다시 생성
- 리뷰 다시 생성
- Gemini 스트리밍 응답을 이용한 실시간 리뷰 출력

### ver3: 앱 확장 및 운영 안정화

서비스를 공개 배포하고 운영할 수 있도록 인증, 보안, 사용량 제한, 배포 설정, 테스트를 확장한 버전입니다.

- Google 로그인 기반 사용자 인증
- Google ID Token 서버 검증
- API 요청 Origin 제한
- 서버 측 rate limit
- 일일 사용량 제한
- Upstash Redis 기반 공유 사용량 저장소 지원
- 이미지 MIME 타입 검증
- base64 형식 검증
- 이미지 파일 시그니처 검증
- 요청 본문 크기 제한
- Gemini API 오류 메시지 사용자 친화 변환
- Vercel 배포 설정
- Netlify 정적 배포 설정
- Nginx 보안 헤더 예시 제공
- Node.js 내장 테스트 러너 기반 테스트
- 배포 설정 동기화 테스트

## 현재 구현 상태

현재 구현은 ver3 범위까지 포함합니다. 핵심 흐름은 다음과 같습니다.

```text
1. Google 로그인
2. 리뷰 분야 선택
3. 사진 업로드 및 이미지 편집
4. 별점 선택
5. 이미지 분석 및 키워드 생성
6. 키워드, 리뷰 길이, 말투 선택
7. 리뷰 스트리밍 생성
8. 리뷰 복사 또는 다시 생성
```

Gemini API 호출은 키워드 생성과 리뷰 생성으로 나뉩니다. 키워드 재생성 또는 리뷰 재생성을 누르면 추가 API 호출이 발생합니다.

## 주요 기능

- 이미지 기반 리뷰 키워드 자동 생성
- 여러 이미지를 종합한 리뷰 키워드 생성
- 장소와 상품 중심 리뷰 지원
- 별점에 따른 긍정, 중립, 부정 뉘앙스 반영
- 리뷰 길이와 말투 옵션 제공
- 실시간 스트리밍 리뷰 출력
- 생성 결과 클립보드 복사
- 로그인 만료 시 토큰 제거 및 재로그인 안내
- 클라이언트와 서버 양쪽의 이미지 검증
- 사용자별 또는 IP별 사용량 제한

## 보안 및 제한

- Gemini API 키는 서버리스 API에서만 사용합니다.
- 클라이언트는 Google ID Token을 `Authorization: Bearer` 헤더로 전달합니다.
- 서버는 Google ID Token의 audience를 `GOOGLE_CLIENT_ID`로 검증합니다.
- 운영 환경에서는 `ALLOWED_ORIGINS`에 포함된 Origin만 API 호출을 허용합니다.
- API JSON 요청 본문은 2MB로 제한합니다.
- 업로드 원본 파일은 클라이언트에서 이미지당 15MB 이하로 제한합니다.
- 서버로 전달되는 디코드 이미지 크기는 이미지당 1.5MB 이하로 제한합니다.
- 허용 이미지 MIME 타입은 `image/jpeg`, `image/png`, `image/webp`입니다.
- `keywords`, `review` 요청은 사용자 또는 IP 기준으로 제한됩니다.
- `ping` 요청은 일일 사용량 제한에서 제외됩니다.
- CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS 설정을 배포 설정에 포함합니다.

사용량 제한은 기본적으로 서버 메모리 `Map`을 사용합니다. 서버리스 인스턴스가 재시작되거나 여러 인스턴스로 분산되면 제한 상태가 완전히 공유되지 않을 수 있습니다. 강한 비용 보호가 필요하면 `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`을 설정해 공유 저장소를 사용합니다.

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| Frontend | React 19 |
| Build Tool | Vite |
| Language | JavaScript ES2022+, ESM |
| Styling | CSS Variables |
| API | Vercel Serverless Functions compatible Node.js API |
| Runtime | Node.js 20.x |
| AI | Google Gemini 2.5 Flash |
| Auth | Google OAuth ID Token verification |
| Tests | Node.js built-in `node:test` |
| Deployment | Vercel, Netlify static config |

## 프로젝트 구조

```text
auto-review-generator/
├─ api/
│  ├─ gemini.js
│  ├─ gemini.test.js
│  ├─ keywordUtils.js
│  ├─ prompts.js
│  └─ prompts.test.js
├─ deploy/
│  └─ nginx/
│     └─ security-headers.conf
├─ shared/
│  ├─ httpJson.js
│  ├─ reviewCategories.js
│  ├─ reviewOptions.js
│  └─ reviewRating.js
├─ src/
│  ├─ App.jsx
│  ├─ main.jsx
│  ├─ index.css
│  ├─ utils/
│  │  └─ env.js
│  └─ components/
│     └─ ReviewGenerator/
│        ├─ ReviewGenerator.jsx
│        ├─ api/
│        │  └─ geminiService.js
│        ├─ steps/
│        │  ├─ ImageEditPanel.jsx
│        │  ├─ ImagePreviewGrid.jsx
│        │  ├─ UploadStep.jsx
│        │  ├─ KeywordStep.jsx
│        │  └─ ReviewStep.jsx
│        └─ utils/
│           ├─ imageUtils.js
│           └─ imageUtils.test.js
├─ deploy-config.test.js
├─ netlify.toml
├─ vercel.json
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
```

- `GEMINI_API_KEY`: Google AI Studio에서 발급한 Gemini API 키입니다. 서버 환경 변수로만 설정합니다.
- `ALLOWED_ORIGINS`: 운영 환경에서 허용할 프론트엔드 Origin 목록입니다. 예: `https://example.com,https://www.example.com`
- `GOOGLE_CLIENT_ID`: 서버에서 Google ID Token을 검증할 때 사용하는 OAuth 클라이언트 ID입니다.
- `VITE_GOOGLE_CLIENT_ID`: 프론트엔드 Google 로그인 버튼에서 사용하는 OAuth 클라이언트 ID입니다.
- `UPSTASH_REDIS_REST_URL`: 공유 사용량 제한 저장소로 사용할 Upstash Redis REST URL입니다.
- `UPSTASH_REDIS_REST_TOKEN`: Upstash Redis REST Token입니다.

운영 환경에서는 `GOOGLE_CLIENT_ID`와 `ALLOWED_ORIGINS`가 필수입니다. 누락되면 API 요청이 차단됩니다.

## 설치 및 실행

```bash
npm install
cp .env.example .env
npm run dev
```

Windows PowerShell에서는 다음 명령으로 `.env` 파일을 준비할 수 있습니다.

```powershell
Copy-Item .env.example .env
```

Vercel 서버리스 함수까지 로컬에서 확인하려면 다음 명령을 사용합니다.

```bash
npm run dev:vercel
```

## 검증 명령

```bash
npm test
npm run lint
npm run build
npm audit --audit-level=moderate
```

현재 테스트는 다음 범위를 검증합니다.

- 이미지 입력 검증
- 서버 rate limit
- 일일 사용량 제한
- 키워드 정제 및 Gemini 키워드 응답 파싱
- Gemini quota/error 메시지 변환
- Vercel/Netlify 보안 헤더 동기화
- Vercel/Netlify 빌드 출력 설정 동기화

## 배포

- Vercel: `vercel.json` 기준으로 정적 빌드와 `/api/gemini` 서버리스 API를 함께 배포합니다.
- Netlify: `netlify.toml` 기준으로 정적 빌드와 보안 헤더를 설정합니다. 현재 상태에서는 `/api/gemini`가 Netlify Functions로 연결되어 있지 않으므로 Netlify 단독 배포에서는 리뷰 생성 API가 동작하지 않습니다.
- Nginx: `deploy/nginx/security-headers.conf`는 자체 호스팅 시 참고할 보안 헤더 예시입니다.

## 문제 해결

- `401`: Google 로그인이 없거나 ID Token이 만료되었습니다. 다시 로그인하세요.
- `403`: 요청 Origin이 `ALLOWED_ORIGINS`에 포함되어 있지 않습니다.
- `413`: 요청 본문 또는 서버 디코드 이미지 크기가 너무 큽니다.
- `415`: 지원하지 않는 이미지 형식입니다. JPG, PNG, WEBP를 사용하세요.
- `429`: 서버 rate limit, 일일 사용량 제한, 또는 Gemini API 할당량 제한입니다. `Retry-After`가 있으면 해당 시간 이후 다시 시도하세요.
- 이미지 업로드 실패: 이미지 형식과 15MB 이하 크기 제한을 확인하세요.
- 리뷰가 너무 짧음: 키워드를 더 선택하거나 리뷰 길이를 조정한 뒤 다시 생성하세요.

## License

MIT

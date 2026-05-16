# Auto Review Generator

사진 1장과 별점, 선택한 키워드를 바탕으로 한국어 리뷰 초안을 생성하는 React + Gemini 웹 애플리케이션입니다.

![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?style=flat-square&logo=javascript)
![Gemini](https://img.shields.io/badge/Gemini_2.5_Flash-4285F4?style=flat-square&logo=google)

## Current Status

현재 구현은 ver1 MVP와 공개 배포를 위한 안정화 항목을 포함합니다.

- 이미지 1장 업로드, 별점 선택, 키워드 생성, 리뷰 생성, 클립보드 복사
- 리뷰 길이 옵션 `short`, `medium`, `long` 서버 반영
- Gemini 스트리밍 응답을 NDJSON으로 즉시 전달하고 화면에 실시간 반영
- Google 로그인 기반 API 보호
- 서버 측 분당 rate limit과 일일 사용량 제한
- 서버 측 이미지 MIME, base64, 파일 시그니처, 크기 검증
- Vercel/Netlify 보안 헤더 동기화 테스트
- Node 내장 테스트 러너 기반 회귀 테스트

## Service Flow

```text
1. Google 로그인
2. 사진 업로드
3. 별점 선택
4. 이미지 분석 + 키워드 생성
5. 키워드, 리뷰 길이, 말투 선택
6. 리뷰 스트리밍 생성
7. 클립보드 복사
```

Gemini API 호출은 기본적으로 키워드 생성 1회, 리뷰 생성 1회로 나뉩니다. 키워드 재생성을 누르면 API 호출이 추가됩니다.

## Features

- 이미지 기반 리뷰 키워드 자동 생성
- 별점에 따른 긍정/중립/부정 맥락 반영
- 리뷰 길이 옵션: 짧게, 보통, 길게
- 말투 옵션: 기본, 친근, 격식, 반말
- 실시간 스트리밍 리뷰 출력
- 생성된 리뷰 클립보드 복사
- 로그인 만료 시 토큰 제거 및 재로그인 안내

## Security And Limits

- Gemini API 키는 서버리스 함수에서만 사용합니다.
- 클라이언트는 Google ID Token을 `Authorization: Bearer` 헤더로 서버에 전달합니다.
- 서버는 Google ID Token audience를 `GOOGLE_CLIENT_ID`로 검증합니다.
- 운영 환경에서는 `ALLOWED_ORIGINS`에 포함된 Origin만 API 호출을 허용합니다.
- 서버 API JSON 요청 본문은 2MB로 제한합니다.
- 업로드 원본 파일은 클라이언트에서 15MB 이하로 제한합니다.
- 서버는 Gemini 전송 전 이미지 데이터를 다시 검증합니다.
- 허용 이미지 MIME 타입은 `image/jpeg`, `image/png`, `image/webp`입니다.
- 서버 측 디코딩 이미지 크기는 약 1.5MB 이하로 제한합니다.
- `keywords`, `review` 요청은 사용자 또는 IP 기준 하루 20회로 제한합니다.
- `ping` 요청은 일일 사용량 제한에서 제외됩니다.
- CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS를 설정합니다.

현재 일일 사용량 제한은 서버 메모리 `Map` 기반입니다. 서버리스 인스턴스가 재시작되거나 여러 인스턴스로 분산되면 한도가 완전히 영속적이지 않습니다. 강한 비용 보호가 필요하면 Redis, KV, DB 같은 공유 저장소로 옮겨야 합니다.

## Implementation Notes

### Review Length

프론트엔드는 `short`, `medium`, `long` 값을 서버에 그대로 보냅니다. 리뷰 길이별 프롬프트 문구와 최소 글자 수 검증은 서버에서 관리합니다.

### Streaming

서버는 Gemini SSE 응답의 `text` 조각을 받을 때마다 `application/x-ndjson` 형식으로 클라이언트에 전달합니다. 클라이언트는 각 JSON 라인을 읽을 때마다 누적 리뷰 텍스트를 갱신합니다.

### Image Validation

클라이언트는 업로드 이미지를 리사이즈하고 JPEG base64로 변환합니다. 서버는 클라이언트를 신뢰하지 않고 MIME allowlist, base64 형식, 디코딩 크기, 파일 시그니처를 다시 확인합니다.

### Login UX

Google 로그인은 `@react-oauth/google`의 공식 `GoogleLogin` 컴포넌트를 그대로 표시합니다. 커스텀 오버레이로 버튼을 숨기지 않습니다.

### Deployment Config

`vercel.json`과 `netlify.toml`은 각각 플랫폼 형식이 달라 파일은 분리되어 있습니다. 대신 `deploy-config.test.js`가 보안 헤더와 빌드 출력 설정이 서로 같은지 검증합니다.

## Tech Stack

| Area | Tech |
| --- | --- |
| Frontend | React 19 |
| Build Tool | Vite |
| Language | JavaScript ES2022+, ESM |
| Styling | CSS Variables |
| Serverless/API | Node.js API compatible with Vercel Serverless Functions |
| API Runtime | Node.js 20.x |
| AI API | Google Gemini 2.5 Flash |
| Auth | Google OAuth ID Token verification |
| Tests | Node.js built-in `node:test` |
| Deployment | Vercel, Netlify static config |

## Project Structure

```text
auto-review-generator/
├─ api/
│  ├─ gemini.js
│  └─ gemini.test.js
├─ deploy/
│  └─ nginx/
│     └─ security-headers.conf
├─ shared/
│  └─ httpJson.js
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
│        │  ├─ UploadStep.jsx
│        │  ├─ KeywordStep.jsx
│        │  └─ ReviewStep.jsx
│        └─ utils/
│           └─ imageUtils.js
├─ deploy-config.test.js
├─ netlify.toml
├─ vercel.json
└─ package.json
```

## Environment Variables

```env
GEMINI_API_KEY=
ALLOWED_ORIGINS=
GOOGLE_CLIENT_ID=
VITE_GOOGLE_CLIENT_ID=
```

- `GEMINI_API_KEY`: Google AI Studio에서 발급한 Gemini API 키입니다. 서버 환경변수로만 설정합니다.
- `ALLOWED_ORIGINS`: 운영 환경에서 허용할 프론트엔드 Origin 목록입니다. 예: `https://example.com,https://www.example.com`
- `GOOGLE_CLIENT_ID`: 서버에서 Google ID Token을 검증할 때 사용하는 OAuth 웹 클라이언트 ID입니다.
- `VITE_GOOGLE_CLIENT_ID`: 프론트 Google 로그인 버튼에서 사용하는 OAuth 웹 클라이언트 ID입니다. 브라우저에 노출되는 공개 식별자입니다.

운영 환경에서는 `GOOGLE_CLIENT_ID`와 `ALLOWED_ORIGINS`가 필수입니다. 누락되면 API가 500으로 차단됩니다.

## Install And Run

```bash
npm install
cp .env.example .env
npm run dev
```

Windows PowerShell에서는 다음 명령으로 `.env`를 준비할 수 있습니다.

```powershell
Copy-Item .env.example .env
```

Vercel 서버리스 함수까지 로컬에서 확인하려면 다음 명령을 사용합니다.

```bash
npm run dev:vercel
```

## Validation Commands

```bash
npm test
npm run lint
npm run build
npm audit --audit-level=moderate
```

현재 테스트는 다음을 검증합니다.

- 이미지 입력 검증
- 서버 일일 사용량 제한
- 키워드 정제와 Gemini 키워드 응답 파싱
- Gemini quota/error 메시지 변환
- Vercel/Netlify 보안 헤더 동기화
- Vercel/Netlify 빌드 출력 설정 동기화

## Deployment

- Vercel: `vercel.json` 기준으로 정적 빌드와 `/api/gemini` 서버리스 API를 함께 배포합니다.
- Netlify: `netlify.toml` 기준으로 정적 빌드와 보안 헤더를 설정합니다. 현재 상태로는 `/api/gemini`가 Netlify Functions로 연결되지 않으므로 Netlify 단독 배포에서는 리뷰 생성 API가 동작하지 않습니다.
- Nginx: `deploy/nginx/security-headers.conf`는 자체 호스팅 시 참고할 보안 헤더 예시입니다.

## Troubleshooting

- `429`: 서버 rate limit, 일일 사용량 제한, 또는 Gemini API 한도입니다. `Retry-After`가 있으면 해당 시간 이후 다시 시도하세요.
- `401`: Google 로그인이 없거나 ID Token이 만료되었습니다. 다시 로그인하세요.
- `403`: 요청 Origin이 `ALLOWED_ORIGINS`에 없습니다.
- `413`: 요청 본문 또는 서버 디코딩 이미지 크기가 너무 큽니다.
- 이미지 업로드 실패: JPG, PNG, WEBP 형식과 15MB 이하 크기를 확인하세요.
- 리뷰가 너무 짧음: 키워드를 더 선택하거나 다시 생성하세요.

## Ver2 Scope

아래 항목은 아직 구현 범위가 아니라 향후 확장 후보입니다.

- 리뷰 분야 선택: 맛집, 상품, 숙소, 서비스 등
- 다중 이미지 업로드: 한 리뷰에 최대 3장 첨부
- 이미지별 미리보기, 자르기, 회전
- 여러 이미지를 종합한 키워드 생성

## License

MIT

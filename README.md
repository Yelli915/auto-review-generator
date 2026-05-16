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
<<<<<<< HEAD
1. Google 로그인
=======
1. 사진 업로드
   ↓
2. 별점 선택
   ↓
3. 리뷰 길이와 말투 선택
   ↓
4. 이미지 분석 + 키워드 생성
   ↓
5. 키워드 선택
   ↓
6. 리뷰 자동 작성
   ↓
7. 클립보드 복사
```

ver1에서는 Gemini API 호출을 키워드 생성 1회, 리뷰 생성 1회로 나누어 처리합니다. 키워드 재생성 기능을 사용할 경우 재생성할 때마다 API 호출이 1회 추가될 수 있습니다.

## Login UX

- `VITE_GOOGLE_CLIENT_ID`가 없으면 앱 본문 대신 환경 변수 설정 오류를 표시합니다.
- 로그인 전에는 리뷰 생성 플로우를 열지 않고 Google 로그인 버튼과 사용 흐름 안내만 표시합니다.
- 로그인 성공 후에만 이미지 1장 업로드, 키워드 생성, 리뷰 생성 플로우에 진입할 수 있습니다.
- API가 401 응답을 반환하면 저장된 로그인 토큰을 지우고 재로그인 안내를 표시합니다.
- 로그인 후 화면에는 플로우 진행 중에도 접근 가능한 로그아웃 버튼을 제공합니다.

## ver2 Scope

ver2에서는 다음 기능 개선에 집중합니다.

### Review Category

- 리뷰 분야를 맛집 리뷰, 상품 리뷰, 장소 리뷰, 서비스 리뷰로 구분
- 사용자가 리뷰 분야를 직접 선택
- 선택한 분야에 따라 키워드 생성 기준과 리뷰 문체 조정

### Multi Image Upload

- ver2에서는 한 리뷰에 이미지를 최대 3장까지 첨부 가능
- 첨부된 1~3장의 이미지를 종합해 키워드 생성
- 여러 이미지는 같은 리뷰 대상을 설명하는 보조 정보로 사용됨

### Image Editing

- 파일 선택 후 각 이미지 미리보기 제공
- API 전송 전에 각 이미지별 자르기/회전 조정 가능
- 리뷰 대상이 중앙에 잘 보이도록 불필요한 영역을 제거한 뒤 키워드 생성 요청
- 불필요한 배경 정보를 줄여 이미지 기반 키워드 생성 품질 개선

## Service Flow (ver2 Target)

```text
1. 리뷰 분야 선택
   ↓
>>>>>>> 799c4fbd936ce7c3decb904493e5343539b7a556
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

## Implementation Details

### 이미지 처리

- 지원 형식: `jpg`, `jpeg`, `png`, `webp`
- 최대 파일 크기: 15MB
- 클라이언트 리사이징 적용
- API 요청 전 이미지 압축 처리
- 미리보기 렌더링 후 불필요한 객체 URL 해제

### 키워드 생성

- 이미지 분석과 키워드 생성을 하나의 요청 흐름으로 처리합니다.
- 별점 정보를 함께 전달해 긍정/부정 맥락을 반영합니다.
- 키워드는 사용자가 선택할 수 있는 후보 형태로 제공합니다.
- 키워드 재생성 시 API 호출이 추가로 발생할 수 있습니다.

### 키워드 선택

- 사용자는 생성된 키워드를 복수 선택할 수 있습니다.
- 선택된 키워드는 리뷰 생성 프롬프트의 핵심 맥락으로 사용됩니다.
- 키워드를 1개 이상 선택해야 리뷰 작성 단계로 이동할 수 있습니다.

### 리뷰 생성

- 선택한 키워드, 별점, 리뷰 길이, 말투 옵션을 기반으로 리뷰를 생성합니다.
- 스트리밍 방식으로 생성 결과를 실시간 출력합니다.
- 생성 완료 후 클립보드 복사를 지원합니다.

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

# Auto Review Generator

> 사진 한 장과 별점만으로 리뷰 초안을 빠르게 생성하는 AI 웹앱

이 문서는 Auto Review Generator의 ver1 현재 구현과 ver2 확장 범위를 구분해 정리한 기준 문서입니다. ver1은 사진 1장과 별점 기반 리뷰 생성을 다루며, ver2는 리뷰 맥락과 이미지 입력 품질 개선을 확장 범위로 정의합니다.

![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?style=flat-square&logo=javascript)
![Gemini](https://img.shields.io/badge/Gemini_2.5_Flash-4285F4?style=flat-square&logo=google)

## Version Overview

### ver1: MVP 기능 완성

ver1은 리뷰 생성 기능 자체를 검증하기 위한 첫 버전입니다.

- 사진 1장 업로드
- 별점 선택
- 이미지 기반 키워드 자동 생성
- 키워드 선택 후 리뷰 생성
- 리뷰 길이/말투 옵션 선택
- 스트리밍 출력
- 클립보드 복사
- `ReviewGenerator` 컴포넌트 단위 분리

### ver2: 리뷰 유형 세분화와 이미지 입력 품질 개선

ver2는 리뷰 유형, 다중 이미지 입력, 파일 선택 후 API 전송 전 이미지 조정 단계를 추가해 리뷰 생성 품질을 높이는 버전입니다. 세부 구현 범위는 `ver2 Scope`에서 관리합니다.

## Project Introduction

Auto Review Generator는 리뷰 작성에 어려움을 겪는 사용자가 사진과 별점만으로 빠르게 리뷰 초안을 만들 수 있도록 돕는 AI 웹앱입니다.

음식, 숙박, 상품 등 범용 카테고리를 지원하는 방향으로 확장할 수 있으며, 외부 플랫폼의 리뷰 작성 화면에 컴포넌트 단위로 삽입할 수 있도록 모듈화 구조로 설계되었습니다.

주요 목표는 다음과 같습니다.

- 리뷰 작성 진입 장벽 낮추기
- 이미지 컨텍스트 기반 키워드 제공
- 별점에 따른 긍정/부정 톤 자동 조절
- 말투와 리뷰 길이 옵션을 통한 리뷰 다양성 확보
- Gemini API 호출 횟수 최소화

## Current Status

현재 README는 ver1 구현 상태와 ver2 확장 범위를 함께 관리하는 기준 문서입니다. 저장소의 현재 구현은 ver1 기능과 공개 배포를 위한 안정화 항목을 포함합니다. 예정 기능의 세부 범위는 아래 `ver2 Scope`에만 정리합니다.

구현 현황:

- 구현됨: 이미지 1장 업로드, 별점 선택, 키워드 생성, 리뷰 생성, 스트리밍 출력, 클립보드 복사
- 구현됨: Google 로그인 기반 API 보호, Origin allowlist, 서버리스 API 인증/제한 로직, 보안 헤더 설정
- ver2 구현 범위: 리뷰 유형 세분화와 이미지 입력 개선. 세부 항목은 `ver2 Scope` 참고

검증 시점:

- 2026-05-11 (KST)

검증 기준:

- 빌드 검증: `npm run build`가 오류 없이 완료되어야 합니다.
- 린트 검증: `npm run lint`가 오류 없이 완료되어야 합니다.
- 의존성 보안 감사: `npm audit --audit-level=moderate` 결과가 `found 0 vulnerabilities`여야 합니다.
- 비밀값 검색: 저장소 전체에서 API 키, OAuth secret, bearer token, private key, refresh token 패턴이 발견되지 않아야 합니다.
- 위험 코드 검색: 저장소 전체에서 `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `document.write`가 발견되지 않아야 합니다.
- Git 추적 파일 확인: `.env`, `node_modules`, `dist`, `.vercel`이 Git 추적 대상에 포함되지 않아야 합니다.
- 깨진 문자열 확인: README, API, UI 코드에서 깨진 한글 패턴이 발견되지 않아야 합니다.

참고 결과:

아래 항목은 검증 로그와 기준 커밋이 문서에 함께 기록되어 있지 않으므로, 최신 상태를 보장하는 결과가 아니라 문서 정리 시점의 참고용 상태입니다. 검증 로그와 기준 커밋이 추가되기 전까지는 아래 결과를 배포 판단 근거로 사용하지 않습니다.

- 빌드: 통과한 것으로 기록됨
- 린트: 통과한 것으로 기록됨
- 의존성 보안 감사: `found 0 vulnerabilities`로 기록됨
- 비밀값 커밋 여부: 실제 키/토큰 없음으로 기록됨
- 위험 DOM 실행 패턴: 없음으로 기록됨
- `.env`: Git 추적 제외로 기록됨
- `.env.example`: 빈 예시 값만 포함된 것으로 기록됨

## Features

현재 구현된 기능:

- 사진 1장 업로드
- 별점 기반 리뷰 맥락 반영
- 이미지 기반 리뷰 키워드 자동 생성
- 키워드 선택형 리뷰 초안 생성
- 리뷰 길이와 말투 옵션 제공
- 스트리밍 방식의 리뷰 출력
- 클립보드 복사 지원

## Service Flow

```text
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
2. 사진 업로드
   - 1~3장
   - 각 이미지 미리보기
   - API 전송 전 자르기/회전 조정
   ↓
3. 별점 선택
   ↓
4. 전체 이미지 종합 분석 + 키워드 생성
   ↓
5. 키워드, 길이, 말투 선택
   ↓
6. 리뷰 자동 작성
   ↓
7. 클립보드 복사
```

ver2 목표 플로우에서는 Gemini API 호출을 키워드 생성 1회, 리뷰 생성 1회로 설계할 예정입니다. 키워드 재생성 기능을 유지하면 재생성할 때마다 API 호출이 1회 추가될 수 있습니다.

## Tech Stack

| 분류 | 기술 |
| --- | --- |
| Frontend | React 19 |
| Build Tool | Vite |
| Language | JavaScript ES2022+, ESM |
| Styling | CSS Variables |
| Serverless/API | Vercel Serverless Function 호환 Node.js API (`api/gemini.js`) |
| API Runtime | Node.js 20.x |
| AI API | Google Gemini 2.5 Flash |
| 인증 | Google OAuth ID Token 검증 (`google-auth-library`) |
| 배포 | Vercel 정적 배포 + 서버리스 API, Netlify 정적 배포/보안 헤더 설정 |
| 보안 헤더 | Vercel Headers, Netlify Headers, Nginx 예시 설정 |

## Project Structure

```text
auto-review-generator/
├── api/
│   └── gemini.js
│       서버리스 API 엔드포인트입니다. `/api/gemini` 요청을 처리하고,
│       Google ID Token 검증, Origin allowlist, rate limit,
│       Gemini API 호출을 담당합니다.
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   ├── index.css
│   ├── utils/
│   │   └── env.js
│   └── components/
│       └── ReviewGenerator/
│           ├── ReviewGenerator.jsx
│           ├── api/
│           │   └── geminiService.js
│           │       프론트엔드 API 클라이언트입니다. 서버리스 엔드포인트
│           │       `/api/gemini`로 이미지, 별점, 키워드 요청을 보냅니다.
│           ├── steps/
│           │   ├── UploadStep.jsx
│           │   ├── KeywordStep.jsx
│           │   └── ReviewStep.jsx
│           └── utils/
│               └── imageUtils.js
├── deploy/
│   └── nginx/
│       └── security-headers.conf
│           자체 호스팅 시 참고할 보안 헤더 예시입니다.
├── vercel.json
│   Vercel 정적 빌드 및 보안 헤더 설정입니다.
├── netlify.toml
│   Netlify 정적 빌드 및 보안 헤더 설정입니다. 현재 Netlify Functions와
│   `/api/gemini` 리다이렉트는 포함되어 있지 않습니다.
├── package.json
└── README.md
```

ver2 구현 시 추가될 수 있는 구조:

```text
src/components/ReviewGenerator/
├── steps/
│   ├── CategoryStep.jsx
│   ├── ImageEditStep.jsx
│   └── ...
└── utils/
    ├── imageUtils.js
    └── reviewCategories.js
```

위 파일은 ver2 기능 구현 범위에 포함되는 예정 구조입니다. 실제 파일명이 달라지면 README도 구현 결과에 맞춰 갱신해야 합니다.

외부 앱 삽입 예시:

```jsx
// 호출 파일의 위치에 따라 상대 경로는 조정해야 합니다.
import ReviewGenerator from './components/ReviewGenerator/ReviewGenerator'

function handleReviewComplete(review) {
  // 완성된 리뷰를 상위 앱의 리뷰 입력창 등에 전달합니다.
}

<ReviewGenerator onReviewComplete={handleReviewComplete} />
```

## Environment Variables

```env
GEMINI_API_KEY=
ALLOWED_ORIGINS=
GOOGLE_CLIENT_ID=
VITE_GOOGLE_CLIENT_ID=
```

- `GEMINI_API_KEY`: Google AI Studio에서 발급한 Gemini API 키입니다. 서버 환경변수로만 설정하고 Git에 커밋하지 마세요.
- `ALLOWED_ORIGINS`: 운영 환경에서 허용할 프론트 도메인 목록입니다. 예: `https://example.com,https://www.example.com`
- `GOOGLE_CLIENT_ID`: 서버에서 Google ID Token 검증에 사용하는 OAuth 웹 클라이언트 ID입니다.
- `VITE_GOOGLE_CLIENT_ID`: 프론트 Google 로그인 버튼에 사용하는 OAuth 웹 클라이언트 ID입니다. 브라우저에 노출되는 공개 식별자이며 비밀값이 아닙니다.

운영 환경에서는 `GOOGLE_CLIENT_ID`와 `ALLOWED_ORIGINS`가 필수입니다. 누락되면 API가 500으로 차단됩니다.

Google Cloud Console의 OAuth 웹 클라이언트 설정에서도 승인된 JavaScript 원본과 리디렉션 도메인을 실제 배포 도메인으로 제한해야 합니다.

## Security Checklist

- Gemini API 키는 서버리스 함수에서만 사용합니다.
- 클라이언트는 Google ID Token을 `Authorization: Bearer` 헤더로 서버에 전달합니다.
- 서버는 Google ID Token audience를 `GOOGLE_CLIENT_ID`로 검증합니다.
- 운영 환경에서는 `ALLOWED_ORIGINS`에 포함된 Origin만 API를 호출할 수 있습니다.
- 서버 API의 JSON 요청 본문은 2MB로 제한합니다. 프론트 업로드 파일 제한 15MB와는 별개이며, 이미지는 전송 전에 리사이즈/압축됩니다.
- 사용자별/IP별 레이트리밋을 적용합니다.
- CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS를 설정합니다.
- `.env`, `node_modules`, `dist`, `.vercel`은 Git 추적에서 제외합니다.
- README 예시에서 사용자 리뷰를 콘솔에 남기는 패턴을 제거했습니다.

## Install and Run

```bash
npm install
cp .env.example .env
npm run dev
```

Windows PowerShell에서는 다음 명령으로 `.env`를 준비합니다.

```powershell
Copy-Item .env.example .env
```

Vercel 서버리스 함수까지 함께 테스트하려면 다음 명령을 사용합니다.

```bash
npm run dev:vercel
```

`npm run dev:vercel`은 Vercel CLI가 필요합니다. 전역 설치 또는 `npx vercel dev` 사용을 전제로 합니다.

실행 환경:

- Node.js 20 이상
- npm 10 이상
- 최신 브라우저 Chrome, Edge, Safari 권장

## Validation Commands

```bash
npm run build
npm run lint
npm audit --audit-level=moderate
```

## Deployment

이 프로젝트는 Vercel 배포 설정과 Netlify 정적 배포 설정을 함께 포함합니다. 현재 서버리스 API는 Vercel의 루트 `api/gemini.js` 구조만 기준으로 합니다.

- Vercel: `vercel.json`, 정적 빌드와 `/api/gemini` 서버리스 API를 함께 배포합니다.
- Netlify: `netlify.toml`, 정적 빌드와 보안 헤더만 설정합니다. 현재 상태로는 `/api/gemini`가 Netlify Functions로 연결되지 않으므로, Netlify 단독 배포에서는 리뷰 생성 API가 동작하지 않습니다. Netlify에서 API까지 운영하려면 Netlify Functions용 엔드포인트와 `/api/gemini` redirect 설정을 별도로 추가해야 합니다.
- Nginx 보안 헤더 예시: `deploy/nginx/security-headers.conf`

## Troubleshooting

- `429` 응답: 서버 레이트리밋 또는 Gemini 요청 한도입니다. 잠시 후 다시 시도하세요.
- CORS/Origin 오류: `ALLOWED_ORIGINS`에 현재 프론트 도메인을 추가하세요.
- OAuth 오류: `GOOGLE_CLIENT_ID`와 `VITE_GOOGLE_CLIENT_ID`가 같은 웹 클라이언트 ID인지 확인하세요.
- 이미지 업로드 실패: 원본 파일 형식과 15MB 이하 크기를 확인하세요. 업로드 후 리사이즈/압축된 API 요청 본문이 2MB를 넘는 경우에도 서버에서 거부될 수 있습니다.
- 리뷰가 너무 짧음: 키워드를 더 선택하거나 다시 생성하세요.

## License

MIT
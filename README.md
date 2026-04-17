# 🧾 Auto Review Generator

> 사진 한 장과 별점만으로 리뷰 초안을 빠르게 생성하는 AI 웹앱

![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?style=flat-square&logo=javascript)
![Gemini](https://img.shields.io/badge/Gemini_2.5_Flash-Free_Tier-4285F4?style=flat-square&logo=google)
![Capacitor](https://img.shields.io/badge/Capacitor-Android-119EFF?style=flat-square&logo=capacitor)

---

## 📌 프로젝트 소개

사용자가 사진을 업로드하고 별점을 입력하면, AI가 이미지를 분석하여 맥락에 맞는 키워드를 제시하고 자동으로 리뷰 문장을 생성합니다.

음식, 숙박, 상품 등 **범용 카테고리**를 지원하며, 외부 플랫폼(배달앱, 예약앱 등)에 **컴포넌트 단위로 삽입** 가능하도록 모듈화 구조로 설계되었습니다. Capacitor를 통해 Android 앱으로도 배포됩니다.

### 핵심 목표

- 리뷰 작성에 어려움을 겪는 사용자의 진입 장벽을 낮춤
- 이미지 컨텍스트 기반의 개인화된 키워드 제공
- 별점에 따라 자동으로 긍정 / 부정 톤 조절
- 말투·감정 강도 파라미터로 획일적 리뷰 방지
- API 비용 최소화 (Google Gemini 2.5 Flash 무료티어 활용)

---

## 🛠 기술 스택

| 분류 | 기술 | 선택 이유 |
|------|------|-----------|
| 프론트엔드 | React 19 | 컴포넌트 기반 구조로 외부 삽입 용이 |
| 언어 | JavaScript ES2022+ | 표준 비동기 처리, ReadableStream 지원 |
| 스타일 | CSS Variables | 라이트 / 다크 모드 자동 대응 |
| AI API | Google Gemini 2.5 Flash | 무료티어 제공, 멀티모달 단일 호출 지원 |
| 앱 래퍼 | Capacitor | 기존 React 코드 재사용, Android APK 직접 생성 |

### Gemini 2.5 Flash를 선택한 이유

Claude Sonnet, GPT-4o 등 상용 API 대비 **무료 한도가 넓고**, 이미지 + 텍스트 처리를 단일 호출로 지원하여 파이프라인을 단순하게 유지할 수 있습니다. 초기 트래픽 규모에서 비용 없이 전체 기능을 검증할 수 있다는 점이 MVP 단계에 적합합니다.

| 무료티어 한도 | 수치 |
|---|---|
| 분당 요청 | 15회 |
| 일일 요청 | 1,500회 |
| 분당 토큰 | 1,000,000 tokens |
| 일일 가용 사용자 (추정) | 약 500~750명 |

> 무료티어 수치는 변동될 수 있어, 배포 전 [공식 문서](https://ai.google.dev/gemini-api/docs/rate-limits) 기준으로 재확인하는 것을 권장합니다.

---

## 🔄 서비스 플로우

```
[1단계] 사진 업로드 + 별점 선택 + 리뷰 길이 / 말투 / 감정 강도 선택
           │
           ▼  ── API 호출 1회 ──
[2~3단계] 이미지 분석 + 키워드 3~8개 생성
         (별점 기반 긍정도 자동 조절 / 새로고침으로 재생성 가능)
           │
           ▼
[4단계]  키워드 토글 선택 (복수 선택, 선택 순서 유지)
           │
           ▼  ── API 호출 1회 ──
[5단계]  리뷰 자동 작성 (스트리밍 실시간 출력 + 클립보드 복사)
```

> 세션당 최소 **API 2회 호출**로 전체 플로우 완성. 키워드 새로고침 시 1회 추가.

---

## 📂 프로젝트 구조

UI와 API 로직을 완전히 분리하여 외부 앱 삽입 시 `ReviewGenerator.jsx` 하나만 import하면 됩니다.

```
src/
└── components/
    └── ReviewGenerator/
        ├── ReviewGenerator.jsx       # 최상위 컴포넌트 (상태 관리 + 단계 전환)
        ├── steps/
        │   ├── UploadStep.jsx        # 이미지 업로드 + 별점 + 옵션 선택
        │   ├── KeywordStep.jsx       # 키워드 표시 + 토글 선택 + 새로고침
        │   └── ReviewStep.jsx        # 생성된 리뷰 표시 + 복사 버튼
        ├── api/
        │   └── geminiService.js      # API 호출 전담 (UI 완전 분리)
        └── utils/
            └── imageUtils.js         # 파일 유효성 검사, base64 변환, 리사이징
```

### 외부 앱 삽입 예시

```jsx
import ReviewGenerator from './ReviewGenerator';

// 다른 앱에서 한 줄로 삽입
<ReviewGenerator onReviewComplete={(review) => console.log(review)} />
```

`onReviewComplete` 콜백으로 완성된 리뷰를 상위 앱에 전달하여 외부 서비스의 리뷰 입력창에 자동 삽입하는 방식으로 확장할 수 있습니다.

---

## ⚙️ 구현 상세

### 이미지 처리

- 지원 형식: `jpg`, `jpeg`, `png`, `webp`
- 최대 파일 크기: 15MB (초과 시 업로드 차단)
- 클라이언트 리사이징: `maxEdge: 512px`, `JPEG quality: 0.75`
- `URL.createObjectURL()`로 미리보기 즉시 렌더링, 로드 후 메모리 해제

### 키워드 생성 (API 호출 1회)

```js
// POST .../gemini-2.5-flash:generateContent
{
  "contents": [{
    "parts": [
      { "inline_data": { "mime_type": "image/jpeg", "data": "{base64Image}" } },
      { "text": "별점 {rating}점 기준 한국어 키워드 3~8개를 JSON으로만 반환해줘." }
    ]
  }],
  "generationConfig": {
    "temperature": 0.1,
    "maxOutputTokens": 320,
    "responseMimeType": "application/json",
    "responseSchema": { "type": "object", "required": ["keywords"] }
  }
}
```

- 이미지 분석과 키워드 생성을 **단일 호출로 묶어** 비용·레이턴시 최소화
- `temperature: 0.1`로 응답 형식 안정성 우선
- `responseSchema`로 키워드 배열 형식을 강제
- 파싱 실패 시 3단계 복구 로직 적용 (직접 파싱 → 균형 괄호 추출 → 따옴표 토큰 추출)

### 키워드 선택

- `selectedKeywords: string[]` 상태로 토글 관리
- **선택 순서 유지** → 리뷰 문장의 자연스러운 흐름 확보
- 새로고침 디바운스 900ms 적용 (연속 요청 방지)
- 1개 이상 선택 시 "리뷰 작성" 버튼 활성화

### 리뷰 생성 (스트리밍)

```js
const lengthMap = {
  short:  '2~3문장 이내로 간결하게',
  medium: '4~5문장 분량으로',
  long:   '7~8문장의 상세한 내용으로',
};

const ratingContext = {
  1: { tone: '매우 실망',  focus: '결정적 단점 1~2가지를 명확히' },
  2: { tone: '아쉬움',     focus: '기대에 못 미친 부분, 재방문 의사 없음' },
  3: { tone: '무난함',     focus: '특별하지 않지만 나쁘지 않은, 조건부 추천' },
  4: { tone: '만족',       focus: '좋았던 점 위주, 작은 아쉬움 한 가지 곁들이기' },
  5: { tone: '강력 추천',  focus: '구체적 감동 포인트, 재방문·주변 추천 의사' },
};
```

- `streamGenerateContent` 엔드포인트로 SSE 스트리밍 적용
- `ReadableStream + TextDecoder` 기반 **누적 버퍼 파싱** → 청크 경계에서 JSON이 잘려도 복구 가능
- 완성 후 클립보드 복사 버튼 제공

---

## 🎭 리뷰 다양성 설계

### 적용됨 (v1.0)

| 파라미터 | 옵션 |
|---|---|
| 말투 | 구어체 존댓말 / 구어체 반말 / 문어체 |
| 감정 강도 | 담담하게 / 보통 / 열정적으로 |
| 리뷰 길이 | 짧게 / 보통 / 길게 |
| 별점 세분화 | 1~5점별 톤·포커스 분기 |

### 다음 버전 후보

| 요소 | 효과 | 난이도 |
|---|---|---|
| 네거티브 프롬프트 | 클리셰 표현 즉각 제거 | 매우 쉬움 |
| 구조 템플릿 랜덤화 | 형식적 다양성 확보 | 쉬움 |
| 페르소나 선택 | 가장 큰 체감 효과 | 보통 |
| 이미지 심층 분석 | 키워드 품질 향상 | 보통 |

---

## 🚧 기술적 도전 과제

| 문제 | 원인 | 해결 방법 |
|------|------|-----------|
| JSON 파싱 불안정 | LLM이 형식 외 텍스트를 반환하거나 일부만 반환 | `responseSchema` 적용 + 3단계 파싱 복구 로직 |
| 이미지 토큰 과다 | 고해상도 이미지의 높은 토큰 소모 | 클라이언트 리사이징 (`maxEdge: 512`, JPEG `0.75`) |
| 연속 요청 과다 | 빠른 새로고침으로 인한 429 에러 | 디바운스 900ms + 일일 사용량 제한 20회 |
| 스트리밍 청크 누락 | SSE 청크 경계에서 JSON이 분할되는 현상 | `ReadableStream + TextDecoder` 누적 버퍼 파싱 |
| Android WebView 호환 | ReadableStream 미지원 (Android 7.0 미만) | `build.gradle` 최소 타겟 API 24 설정 |

---

## 📱 Android 앱 배포 (Capacitor)

기존 React 코드를 그대로 유지하면서 Capacitor가 WebView로 감싸 APK를 생성합니다.

### 초기 설정

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Auto Review Generator" "com.yourname.autoreview"
npx cap add android
```

### 빌드 및 배포 루틴

```bash
npm run build       # React 빌드 (dist/ 생성)
npx cap sync        # android/ 폴더에 동기화
npx cap open android  # Android Studio에서 APK 생성
```

### Vite 설정 필수 사항

```js
// vite.config.js
export default defineConfig({
  base: './',       // Capacitor WebView는 상대경로 필요 (없으면 흰 화면)
  build: { outDir: 'dist' },
});
```

### Play Store 제출 체크리스트

- [ ] 앱 아이콘 512×512 PNG (Android Studio가 해상도별 자동 생성)
- [ ] 스크린샷 최소 2장
- [ ] 개인정보 처리방침 URL
- [ ] `build.gradle` — `minSdk: 24`, `versionCode`, `versionName` 설정
- [ ] Google Play Console 등록 ($25, 1회)

---

## 🚀 설치 및 실행

```bash
# 저장소 클론
git clone https://github.com/Yelli915/auto-review-generator.git
cd auto-review-generator

# 의존성 설치
npm install

# 환경변수 설정
cp .env.example .env       # macOS / Linux
Copy-Item .env.example .env  # Windows PowerShell

# 개발 서버 실행
npm run dev
```

### 실행 환경

- Node.js 20 이상
- npm 10 이상
- 브라우저 최신 버전 (Chrome / Edge / Safari)

### 환경변수

```
GEMINI_API_KEY=your_google_gemini_api_key
VITE_GEMINI_API_KEY=your_google_gemini_api_key
ALLOWED_ORIGINS=http://localhost:5173,https://your-domain.com
GOOGLE_CLIENT_ID=your_google_oauth_client_id
VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id
```

- Gemini API 키: [Google AI Studio](https://aistudio.google.com/)에서 무료 발급
- Google OAuth Client ID: Google Cloud Console에서 발급한 웹 클라이언트 ID
- 운영 환경에서는 `ALLOWED_ORIGINS`를 반드시 설정하여 허용 도메인만 호출 가능하게 제한

### 문제 해결

| 증상 | 원인 및 해결 |
|---|---|
| `429` 응답 | 서버 레이트리밋 또는 Gemini 한도 → 잠시 후 재시도 |
| CORS 오류 | `ALLOWED_ORIGINS`에 현재 프론트 도메인 추가 |
| OAuth 관련 오류 | `GOOGLE_CLIENT_ID`와 `VITE_GOOGLE_CLIENT_ID` 동일 값 확인 |
| 일일 한도 초과 | 브라우저 기준 1일 20회 제한 → 다음 날 재시도 |
| 이미지 업로드 실패 | 파일 형식(`jpg`, `jpeg`, `png`, `webp`) 및 크기(15MB 이하) 확인 |
| Android 흰 화면 | `vite.config.js`의 `base: './'` 설정 확인 |

---

## 🔐 보안 설정

### 배포 보안 헤더 (CSP)

- **Vercel**: `vercel.json`의 `headers` 사용
- **Netlify**: `netlify.toml`의 `[[headers]]` 사용
- **Nginx**: `deploy/nginx/security-headers.conf`를 서버 블록에 `include`

> `frame-ancestors`는 메타 태그에서 무시되므로 반드시 서버 응답 헤더로 설정해야 합니다.

### 운영 참고

- 프론트 단 일일 요청 제한: **20회** (localStorage 기반)
- 키워드 새로고침 디바운스: **900ms**
- API 키는 서버(Vercel 서버리스) 환경변수로 주입 — 클라이언트에 노출 최소화

---

## 📈 로드맵

### v1.1 (단기)

- 네거티브 프롬프트 적용 (클리셰 표현 방지)
- 리뷰 구조 템플릿 랜덤화 (결론 먼저형 / 스토리형 / 비교형 / 장단점 병렬형)
- 카테고리 선택 추가 (음식 / 숙박 / 상품)
- 생성 리뷰 히스토리 저장 (localStorage)

### v1.x (중기)

- 페르소나 선택 기능 (꼼꼼한 직장인 / 감성적인 20대 / 블로그 리뷰어 등)
- 이미지 심층 분석 프롬프트 고도화
- 외부 플랫폼 컴포넌트 임베드 (배달앱, 숙박 예약앱 등)

### v2.0 (장기)

- 트래픽 증가 시 Gemini Flash 유료 전환 또는 Claude Sonnet 업그레이드
- 하이브리드 구조 전환: 이미지 분석(Vision API) + 텍스트 생성(소형 LLM) 분리
- iOS 배포 (Capacitor 기반 동일 코드베이스)

---

## 📄 라이선스

MIT License

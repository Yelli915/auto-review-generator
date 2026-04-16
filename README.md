# 🧾 Auto Review Generator v1.0

> v1.0 정식 배포: 사진 한 장과 별점만으로 리뷰 초안을 빠르게 생성하는 AI 웹앱

![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?style=flat-square&logo=javascript)
![Gemini](https://img.shields.io/badge/Gemini_Flash-Free_Tier-4285F4?style=flat-square&logo=google)

---

## 📢 배포 공지 (v1.0)

Auto Review Generator v1.0이 배포되었습니다.  
이제 사용자는 사진 업로드와 별점 선택만으로 리뷰 키워드와 본문을 자동 생성할 수 있습니다.

### 이번 배포에서 제공되는 핵심 기능

- 사진 + 별점 기반 키워드 자동 생성
- 키워드 선택 후 리뷰 자동 작성
- 리뷰 길이/말투 옵션 선택
- 스트리밍 출력 + 클립보드 복사
- 외부 서비스 삽입 가능한 컴포넌트 구조

---

## 📌 서비스 소개

사용자가 사진을 업로드하고 별점을 입력하면, AI가 이미지를 분석하여 맥락에 맞는 키워드를 제시하고 자동으로 리뷰 문장을 생성합니다.

음식, 숙박, 상품 등 **범용 카테고리**를 지원하며, 추후 외부 플랫폼(배달앱, 예약앱 등)에 **컴포넌트 단위로 삽입** 가능하도록 모듈화 구조로 설계되었습니다.

### 핵심 목표

- 리뷰 작성에 어려움을 겪는 사용자의 진입 장벽을 낮춤
- 이미지 컨텍스트 기반의 개인화된 키워드 제공
- 별점에 따라 자동으로 긍정 / 부정 톤 조절
- 페르소나 · 문체 · 구조 다양화로 획일적 리뷰 방지
- API 비용 최소화 (Google Gemini Flash 무료티어 활용)

---

## 🛠 기술 스택

| 분류 | 기술 | 선택 이유 |
|------|------|-----------|
| 프론트엔드 | React 19 | 컴포넌트 기반 구조로 외부 삽입 용이 |
| 언어 | JavaScript ES2022+ | 표준 비동기 처리, ReadableStream 지원 |
| 스타일 | CSS Variables | 라이트 / 다크 모드 자동 대응 |
| AI API | Google Gemini 2.5 Flash | 무료티어 제공, 멀티모달 단일 호출 지원 |

### Gemini Flash를 선택한 이유

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
[1단계] 사진 업로드 + 별점 선택 + 리뷰 길이 선택
           │
           ▼  ── API 호출 1회 ──
[2~3단계] 이미지 분석 + 키워드 8개 생성
         (별점 기반 긍정도 자동 조절 / 새로고침으로 재생성 가능)
           │
           ▼
[4단계]  키워드 토글 선택 (복수 선택 가능)
           │
           ▼  ── API 호출 1회 ──
[5단계]  리뷰 자동 작성 (스트리밍 실시간 출력 + 클립보드 복사)
```

> 세션당 최소 **API 2회 호출**로 전체 플로우 완성. 키워드 새로고침 시 1회 추가.

---

## 📂 컴포넌트 구조

UI와 API 로직을 완전히 분리하여 외부 앱 삽입 시 `ReviewGenerator.jsx` 하나만 import하면 됩니다.

```
ReviewGenerator/
├── ReviewGenerator.jsx       # 최상위 컴포넌트 (상태 관리 + 단계 전환)
├── steps/
│   ├── UploadStep.jsx        # 이미지 업로드 + 별점 + 길이 선택
│   ├── KeywordStep.jsx       # 키워드 표시 + 토글 선택 + 새로고침
│   └── ReviewStep.jsx        # 생성된 리뷰 표시 + 복사 버튼
├── api/
│   └── geminiService.js      # API 호출 전담 (UI 완전 분리)
└── utils/
    └── imageUtils.js         # base64 변환, 이미지 리사이징
```

### 외부 앱 삽입 예시

```jsx
import ReviewGenerator from './ReviewGenerator';

// 다른 앱에서 한 줄로 삽입
<ReviewGenerator onReviewComplete={(review) => console.log(review)} />
```

`onReviewComplete` 콜백으로 완성된 리뷰를 상위 앱에 전달하여 외부 서비스의 리뷰 입력창에 자동 삽입하는 방식으로 확장할 수 있습니다.

---

## ⚙️ 단계별 구현 상세

### 1단계 — 사진 업로드 + 별점 입력

```js
const handleImageUpload = (e) => {
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = () => setBase64Image(reader.result.split(',')[1]);
  reader.readAsDataURL(file);
};
```

- `FileReader API`로 이미지를 base64 변환하여 메모리에 보관
- `URL.createObjectURL()`로 미리보기 즉시 렌더링
- 업로드 파일 크기 제한: 최대 15MB
- 클라이언트 리사이징: `maxEdge: 512`, `JPEG quality: 0.75`

### 2~3단계 — 이미지 분석 + 키워드 생성 (단일 API 호출)

```js
// POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={API_KEY}
{
  "contents": [{
    "parts": [
      { "inline_data": { "mime_type": "image/jpeg", "data": "{base64Image}" } },
      { "text": "별점 {rating}점 기준 한국어 키워드 3~8개를 JSON으로만 반환해줘. {\"keywords\": [...]}" }
    ]
  }],
  "generationConfig": {
    "temperature": 0.1,
    "maxOutputTokens": 320,
    "responseMimeType": "application/json",
    "responseJsonSchema": { "type": "object", "required": ["keywords"] }
  }
}
```

- 이미지 분석과 키워드 생성을 **단일 호출로 묶어** 비용·레이턴시 최소화
- `temperature: 0.1`로 응답 형식 안정성 우선
- `responseJsonSchema`로 키워드 배열 형식을 강제
- 파싱 실패 시 보정 로직(균형 괄호 추출, 라인/quoted 토큰 추출)으로 복구 시도

### 4단계 — 키워드 선택

- `selectedKeywords: string[]` 상태로 토글 관리
- 선택 순서 유지 → 리뷰 문장의 자연스러운 흐름 확보
- 1개 이상 선택 시 "리뷰 작성" 버튼 활성화

### 5단계 — 리뷰 자동 작성 (스트리밍)

```js
const lengthMap = {
  short:  '2~3문장 이내로 간결하게',
  medium: '4~5문장 분량으로',
  long:   '7~8문장의 상세한 내용으로',
};
```

- `streamGenerateContent` 엔드포인트로 SSE 스트리밍 적용
- `ReadableStream + TextDecoder`로 청크 단위 수신 → 타이핑 효과 구현
- 완성 후 클립보드 복사 버튼 제공

---

## 🎭 리뷰 생성 전략 (v1.0)

v1.0에서는 안정적인 결과를 우선하고, 일부 다양성 기능은 다음 버전 후보로 유지합니다.

### 1. 문체 / 어조 파라미터 (적용됨)

| 파라미터 | 옵션 |
|---|---|
| 말투 | 구어체 / 문어체 / 반말 / 존댓말 |
| 감정 강도 | 담담하게 / 보통 / 열정적으로 |
| 표현 방식 | 사실 나열형 / 스토리텔링형 / 비교형 |
| 문장 길이 | 단문 위주 / 복문 혼합 |

### 2. 별점 세분화 — 단순 긍/부정 탈피 (적용됨)

```js
const ratingContext = {
  1: { tone: '매우 실망',  focus: '결정적 단점 1~2가지를 명확히' },
  2: { tone: '아쉬움',     focus: '기대에 못 미친 부분, 재방문 의사 없음' },
  3: { tone: '무난함',     focus: '특별하지 않지만 나쁘지 않은, 조건부 추천' },
  4: { tone: '만족',       focus: '좋았던 점 위주, 작은 아쉬움 한 가지 곁들이기' },
  5: { tone: '강력 추천',  focus: '구체적 감동 포인트, 재방문·주변 추천 의사' },
};
```

4점과 5점 리뷰가 같은 톤으로 나오는 것을 방지합니다.

### 3. 리뷰 구조 템플릿 랜덤화 (다음 버전 후보)

API 호출마다 구조 패턴을 랜덤 선택하여 형식적 다양성을 확보합니다.

```
패턴 A  결론 먼저형    한 줄 평가 → 이유 2~3가지 → 마무리 추천
패턴 B  스토리형       방문 맥락 → 첫인상 → 음식/서비스 → 총평
패턴 C  비교형         기대했던 것 → 실제로 느낀 것 → 차이에 대한 평가
패턴 D  장단점 병렬형  좋았던 점 → 아쉬운 점 → 재방문 의향
```

### 4. 이미지 심층 분석 (다음 버전 후보)

단순 태그 추출을 넘어 맥락까지 분석하면 키워드 자체의 차별성이 높아집니다.

```
기본 분석  →  "파스타, 실내, 밝음"

심층 분석  →  면 굵기·토핑·플레이팅 스타일 / 조명 색온도·좌석 간격
              분위기 (데이트 vs 친구 모임) / 음식의 신선도·온도감
```

### 5. 네거티브 프롬프트 — 클리셰 방지 (다음 버전 후보)

LLM이 자주 쓰는 뻔한 표현을 명시적으로 금지합니다.

```
다음 표현은 절대 사용하지 말 것:
"강추합니다", "맛있었어요", "또 오고 싶어요", "직원이 친절했어요",
"가성비 최고", "분위기가 좋아요", "실망하지 않을 거예요"
```

### 구현 우선순위

| 순위 | 요소 | 효과 | 난이도 |
|---|---|---|---|
| 1 | 네거티브 프롬프트 | 즉각적 품질 향상 | 매우 쉬움 (프롬프트만 수정) |
| 2 | 별점 세분화 | 별점별 차별성 확보 | 쉬움 |
| 3 | 구조 템플릿 랜덤화 | 형식적 다양성 | 쉬움 |
| 4 | 페르소나 선택 | 가장 체감 효과 큼 | 보통 |
| 5 | 이미지 심층 분석 | 키워드 품질 향상 | 보통 |
| 6 | Temperature 튜닝 | 미세 조정 | 쉬움 (효과는 작음) |

> v1.0에서는 길이/말투/별점 기반 생성이 반영되어 있고, 나머지 다양성 기능은 다음 버전 후보입니다.

---

## 🚧 기술적 도전 과제

| 문제 | 원인 | 해결 방법 |
|------|------|-----------|
| JSON 파싱 불안정 | LLM이 형식 외 텍스트를 반환하거나 일부만 반환 | `responseJsonSchema` 적용 + 다단계 파싱/보정 로직으로 복구 |
| 이미지 토큰 과다 | 고해상도 이미지의 높은 토큰 소모 | 클라이언트 리사이징 (`maxEdge: 512`, JPEG `0.75`) |
| 요청 과다 | 짧은 시간 내 연속 요청으로 실패율 증가 | 프론트 디바운스(`900ms`) + 일일 사용량 제한(`20회`) + 서버 레이트리밋 |
| 스트리밍 파싱 복잡 | SSE 청크 누락/분할 가능성 | `ReadableStream + TextDecoder` 기반 누적 버퍼 파싱 |

---

## 🚀 설치 및 실행 가이드

```bash
# 저장소 클론
git clone https://github.com/Yelli915/auto-review-generator.git
cd auto-review-generator

# 의존성 설치
npm install

# 환경변수 설정
cp .env.example .env
# .env 파일에 GEMINI_API_KEY 등 필수값 입력

# 개발 서버 실행(프론트)
npm run dev
# 또는 Vercel 서버리스까지 함께 테스트
npm run dev:vercel
```

### 실행 환경

- Node.js 20 이상 권장
- npm 10 이상 권장
- 브라우저 최신 버전(Chrome/Edge/Safari)

### OS별 `.env` 준비

```bash
# macOS / Linux
cp .env.example .env
```

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

### 환경변수

```
GEMINI_API_KEY=your_google_gemini_api_key
ALLOWED_ORIGINS=http://localhost:5173,https://your-domain.com
GOOGLE_CLIENT_ID=your_google_oauth_client_id
VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id
```

Gemini API 키는 [Google AI Studio](https://aistudio.google.com/)에서 무료로 발급받을 수 있습니다.
Google OAuth Client ID는 Google Cloud Console에서 발급한 웹 클라이언트 ID를 사용합니다.
운영 환경에서는 `ALLOWED_ORIGINS`를 반드시 설정해 허용 도메인만 호출 가능하게 제한하세요.
운영 환경에서는 `GOOGLE_CLIENT_ID`가 없으면 API가 500으로 차단되도록 설정되어 있습니다.

### 빠른 사용 방법

1. 앱 접속 후 사진 업로드
2. 별점(1~5점)과 리뷰 길이 선택
3. 생성된 키워드 중 원하는 항목 선택
4. 리뷰 생성 후 복사 버튼으로 사용

### 문제 해결(자주 발생하는 경우)

- `429` 응답: 서버 레이트리밋 또는 Gemini 한도 상태이므로 잠시 후 재시도
- CORS 오류: `ALLOWED_ORIGINS`에 현재 프론트 도메인 추가
- OAuth 관련 오류: `GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID` 동일 값 확인
- 일일 한도 초과: 브라우저 기준 1일 20회 제한, 다음 날 재시도
- 이미지 업로드 실패: 파일 크기/형식 확인(`jpg`, `jpeg`, `png`, `webp` 권장)

### 운영 참고

- 프론트 단 일일 요청 제한: 20회
- 키워드 요청 디바운스: 900ms
- 서버 레이트리밋 적용(과도한 요청 자동 제한)

---

## 🔐 배포 보안 헤더(CSP) 설정

- Vercel: `vercel.json`의 `headers` 사용
- Netlify: `netlify.toml`의 `[[headers]]` 사용
- Nginx: `deploy/nginx/security-headers.conf`를 서버 블록에 `include` 해서 사용

`frame-ancestors`는 메타 태그에서 무시되므로, 반드시 서버 응답 헤더로 설정해야 합니다.

---

## ✅ 릴리즈 노트 (v1.0)

### 이번 1.0에서 제공되는 기능

- 사진 + 별점 기반 리뷰 생성 플로우 완성
- 키워드 생성/선택 후 리뷰 자동 작성
- 스트리밍 출력 및 클립보드 복사 지원
- 이미지 리사이징, JSON 파싱 복구, 재시도 등 안정화 로직 적용
- 컴포넌트 분리 구조로 외부 서비스 임베드 가능

### 배포 안내 문구

Auto Review Generator v1.0은 리뷰 작성 진입 장벽을 낮추기 위한 첫 정식 배포 버전입니다.  
사용자는 짧은 입력만으로 리뷰를 완성하고, 운영자는 기존 서비스에 모듈 형태로 쉽게 연동할 수 있습니다.

### 다음 버전 후보(요약)

- 카테고리별 프롬프트 세분화
- 페르소나/문체 선택 UI
- 생성 이력 저장 및 재활용

---

## 📄 라이선스

MIT License

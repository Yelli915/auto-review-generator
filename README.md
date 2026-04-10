# 🧾 Auto Review Generator

> 사진 한 장과 별점만으로 자동으로 리뷰를 작성해주는 AI 웹 애플리케이션

![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?style=flat-square&logo=javascript)
![Gemini](https://img.shields.io/badge/Gemini_Flash-Free_Tier-4285F4?style=flat-square&logo=google)

---

## 📌 프로젝트 개요

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
| 프론트엔드 | React 18 | 컴포넌트 기반 구조로 외부 삽입 용이 |
| 언어 | JavaScript ES2022+ | 표준 비동기 처리, ReadableStream 지원 |
| 스타일 | CSS Variables | 라이트 / 다크 모드 자동 대응 |
| AI API | Google Gemini 1.5 Flash | 무료티어 제공, 멀티모달 단일 호출 지원 |

### Gemini Flash를 선택한 이유

Claude Sonnet, GPT-4o 등 상용 API 대비 **무료 한도가 넓고**, 이미지 + 텍스트 처리를 단일 호출로 지원하여 파이프라인을 단순하게 유지할 수 있습니다. 초기 트래픽 규모에서 비용 없이 전체 기능을 검증할 수 있다는 점이 MVP 단계에 적합합니다.

| 무료티어 한도 | 수치 |
|---|---|
| 분당 요청 | 15회 |
| 일일 요청 | 1,500회 |
| 분당 토큰 | 1,000,000 tokens |
| 일일 가용 사용자 (추정) | 약 500~750명 |

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
- 4MB 초과 시 `canvas.toBlob()`으로 클라이언트 리사이징 (JPEG quality 0.8)

### 2~3단계 — 이미지 분석 + 키워드 생성 (단일 API 호출)

```js
// POST https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={API_KEY}
{
  "contents": [{
    "parts": [
      { "inline_data": { "mime_type": "image/jpeg", "data": "{base64Image}" } },
      { "text": "별점 {rating}점 기준 키워드 8개를 JSON으로만 반환해줘. {\"keywords\": [...]}" }
    ]
  }],
  "generationConfig": { "temperature": 0.9, "maxOutputTokens": 300 }
}
```

- 이미지 분석과 키워드 생성을 **단일 호출로 묶어** 비용·레이턴시 최소화
- `temperature: 0.9`로 새로고침마다 다양한 키워드 보장
- JSON 파싱 실패 시 `/\{[\s\S]*\}/` 정규식으로 블록 추출 후 재시도

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

## 🎭 리뷰 다양성 설계

획일적인 리뷰 생성을 방지하기 위해 다음 6가지 요소를 프롬프트 전략에 반영합니다.

### 1. 페르소나 다양화

"누가 쓰는가"를 프롬프트에 반영하면 동일한 이미지·별점에서도 전혀 다른 결과가 나옵니다.

```js
const personas = [
  { label: '꼼꼼한 직장인',   prompt: '가성비와 효율 중시, 구체적 수치 언급' },
  { label: '감성적인 20대',   prompt: '분위기·감정 표현 위주, 이모지 자연스럽게 포함' },
  { label: '블로그 리뷰어',   prompt: '장단점 균형 서술, 자연스러운 흐름' },
  { label: '단골 고객',       prompt: '이전 방문과 비교하는 뉘앙스, 친근하고 짧은 문체' },
  { label: '까다로운 미식가', prompt: '전문 용어 사용, 세부 디테일 집중, 높은 기준으로 평가' },
];
```

사용자가 직접 선택하거나, 이미지 분석 결과에 따라 자동 추천하는 방식 모두 가능합니다.

### 2. 문체 / 어조 파라미터

| 파라미터 | 옵션 |
|---|---|
| 말투 | 구어체 / 문어체 / 반말 / 존댓말 |
| 감정 강도 | 담담하게 / 보통 / 열정적으로 |
| 표현 방식 | 사실 나열형 / 스토리텔링형 / 비교형 |
| 문장 길이 | 단문 위주 / 복문 혼합 |

### 3. 별점 세분화 — 단순 긍/부정 탈피

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

### 4. 리뷰 구조 템플릿 랜덤화

API 호출마다 구조 패턴을 랜덤 선택하여 형식적 다양성을 확보합니다.

```
패턴 A  결론 먼저형    한 줄 평가 → 이유 2~3가지 → 마무리 추천
패턴 B  스토리형       방문 맥락 → 첫인상 → 음식/서비스 → 총평
패턴 C  비교형         기대했던 것 → 실제로 느낀 것 → 차이에 대한 평가
패턴 D  장단점 병렬형  좋았던 점 → 아쉬운 점 → 재방문 의향
```

### 5. 이미지 심층 분석

단순 태그 추출을 넘어 맥락까지 분석하면 키워드 자체의 차별성이 높아집니다.

```
기본 분석  →  "파스타, 실내, 밝음"

심층 분석  →  면 굵기·토핑·플레이팅 스타일 / 조명 색온도·좌석 간격
              분위기 (데이트 vs 친구 모임) / 음식의 신선도·온도감
```

### 6. 네거티브 프롬프트 — 클리셰 방지

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

> 1~3순위는 프롬프트 수정만으로 구현되어 코드 변경 없이 즉시 적용 가능합니다.

---

## 🚧 기술적 도전 과제

| 문제 | 원인 | 해결 방법 |
|------|------|-----------|
| JSON 파싱 불안정 | LLM이 JSON 외 텍스트를 함께 반환 | 정규식 `/\{[\s\S]*\}/`으로 JSON 블록만 추출 |
| 이미지 토큰 과다 | 고해상도 이미지의 높은 토큰 소모 | canvas 리사이징 (max 768px) + JPEG 0.8 압축 → 40~50% 절감 |
| 무료 한도 초과 | 429 에러 시 UX 저하 | 지수 백오프 재시도 (1초 → 2초 → 4초) |
| 스트리밍 파싱 복잡 | Gemini SSE 청크 포맷 | `getReader()` + `TextDecoder`로 delta 텍스트만 추출 |

---

## 🚀 시작하기

```bash
# 저장소 클론
git clone https://github.com/your-username/auto-review-generator.git
cd auto-review-generator

# 의존성 설치
npm install

# 환경변수 설정
cp .env.example .env
# .env 파일에 GEMINI_API_KEY=your_api_key 입력

# 개발 서버 실행(프론트)
npm run dev
# 또는 Vercel 서버리스까지 함께 테스트
vercel dev
```

### 환경변수

```
GEMINI_API_KEY=your_google_gemini_api_key
```

Gemini API 키는 [Google AI Studio](https://aistudio.google.com/)에서 무료로 발급받을 수 있습니다.

---

## 📈 확장 로드맵

**단기**
- 네거티브 프롬프트 적용 → 클리셰 표현 방지
- 별점 5단계 세분화 → 톤 차별화
- 리뷰 구조 템플릿 랜덤화 (결론 먼저형 / 스토리형 / 비교형 / 장단점 병렬형)
- 카테고리 선택 추가 (음식 / 숙박 / 상품) → 프롬프트 세분화
- 생성 리뷰 히스토리 저장 (localStorage)

**중기**
- 페르소나 선택 기능 (꼼꼼한 직장인 / 감성적인 20대 / 블로그 리뷰어 등)
- 문체 / 어조 파라미터 선택 UI (구어체·문어체, 감정 강도 등)
- 이미지 심층 분석 프롬프트 고도화
- 외부 플랫폼 컴포넌트 삽입 (배달앱, 숙박 예약앱 등)
- 사용자 피드백 수집 → 프롬프트 품질 개선

**장기**
- 리뷰 도메인 특화 파인튜닝 모델 도입
- 트래픽 증가 시 Gemini Flash 유료 전환 또는 Claude Sonnet 업그레이드
- 하이브리드 구조 전환: 이미지 분석(Vision API) + 텍스트 생성(소형 LLM) 분리

---

## 📄 라이선스

MIT License

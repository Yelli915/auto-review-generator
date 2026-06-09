# Metrics

이 문서는 README에 요약한 성능/검증 지표의 측정 조건과 남은 측정 항목을 기록합니다.

## 검증 결과

측정일: 2026-06-08

| 항목 | 결과 |
| --- | --- |
| `npm test` | 통과: 79 tests, 12 test files, duration 4.98s |
| `npm run lint` | 통과 |
| `npm run build` | 통과: Vite production build 700ms |

## 빌드 산출물

| 파일 | 크기 | gzip |
| --- | ---: | ---: |
| `dist/index.html` | 0.64 kB | 0.37 kB |
| `dist/assets/index-*.css` | 31.33 kB | 6.63 kB |
| `dist/assets/index-*.js` | 246.20 kB | 77.55 kB |

## 브라우저 로드 측정

측정 조건:

- Vite 개발 서버
- Chrome headless
- viewport: 1440 x 900
- `VITE_GOOGLE_CLIENT_ID=dummy-client-id`
- 측정 화면: 로그인 전 첫 화면

| 항목 | 결과 |
| --- | ---: |
| 첫 화면 제목 표시 | `사진 한 장으로 리뷰 초안까지` |
| wall time | 603 ms |
| DOMContentLoaded | 470 ms |
| load event | 474 ms |
| first paint | 480 ms |

Lighthouse 패키지는 현재 프로젝트 의존성에 포함되어 있지 않아 Lighthouse 점수는 측정하지 않았습니다. Lighthouse 점수가 필요하면 배포 URL 또는 preview 서버 기준으로 별도 측정합니다.

## Gemini 스트리밍 응답 측정

현재 셸에 `GEMINI_API_KEY`가 없어 실제 Gemini 응답 시간과 첫 스트림 청크 시간은 측정하지 않았습니다.

실측 시 기록할 항목:

- 리뷰 생성 요청 시작 시각
- 첫 NDJSON `text` chunk 수신 시간
- `done: true` 수신 시간
- 선택한 리뷰 길이와 키워드 개수
- Gemini quota 또는 rate limit 오류 여부

권장 표기:

| 항목 | 결과 |
| --- | ---: |
| 첫 chunk 표시 시간 | 측정 예정 |
| 전체 리뷰 생성 시간 | 측정 예정 |
| 조건 | medium length, 5 keywords, product review |

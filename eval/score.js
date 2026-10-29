import { findUnsupportedTokens } from '../shared/evidenceCheck.js'
import { normalizeKeywordText } from '../shared/keywordPhrase.js'
import { findMissingKeywords } from '../src/components/ReviewGenerator/utils/keywordHighlight.js'
import { getGenericBanPhrases } from '../server/review/config.js'

// 리뷰 한 편을 입력 근거와 비교해 채점합니다.
// 환각 = 근거에 없는 숫자·영문 토큰(findUnsupportedTokens) + 케이스별 금지 표현.

export function scoreReview({ review, finishReason, minReviewChars, testCase }) {
  const text = normalizeKeywordText(review)
  const sourceText = [testCase.productContext ?? '', ...testCase.keywords].join('\n')
  const unsupported = findUnsupportedTokens(text, sourceText)
  const forbiddenHits = (testCase.forbidden ?? []).filter((word) => text.includes(word))
  const genericHits = getGenericBanPhrases(testCase.category).filter((word) => text.includes(word))
  const missingKeywords = findMissingKeywords(text, testCase.keywords)

  return {
    chars: text.length,
    tooShort: text.length < minReviewChars,
    truncated: finishReason === 'MAX_TOKENS',
    unsupported,
    forbiddenHits,
    genericHits,
    missingKeywords,
    hallucinated: unsupported.length > 0 || forbiddenHits.length > 0,
    keywordCoverage: testCase.keywords.length
      ? 1 - missingKeywords.length / testCase.keywords.length
      : 1,
  }
}

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

const rate = (results, key) => results.filter((r) => r.score[key]).length / results.length

// results: [{ score, ttftMs, totalMs }] — 실패(error) 결과는 빼고 넘깁니다.
export function summarize(results, failed = 0) {
  if (!results.length) return { runs: 0, failed }
  return {
    runs: results.length,
    failed,
    hallucinationRate: rate(results, 'hallucinated'),
    keywordCoverage:
      results.reduce((sum, r) => sum + r.score.keywordCoverage, 0) / results.length,
    tooShortRate: rate(results, 'tooShort'),
    truncatedRate: rate(results, 'truncated'),
    genericPhraseRate: results.filter((r) => r.score.genericHits.length).length / results.length,
    medianTtftMs: median(results.map((r) => r.ttftMs).filter(Number.isFinite)),
    medianTotalMs: median(results.map((r) => r.totalMs)),
  }
}

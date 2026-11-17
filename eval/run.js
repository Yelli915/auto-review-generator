/* global process */
// 리뷰 프롬프트 품질 평가. eval/cases.json의 각 케이스로 실제 리뷰를 만들고 채점합니다.
// 사용법: npm run eval -- --label 프롬프트v3 [--runs 2] [--only beauty] [--baseline eval/results/프롬프트v2.json]
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { createJsonHeaders } from '../shared/httpJson.js'
import { readLines } from '../shared/streamLines.js'
import { buildReviewPrompt } from '../server/review/prompts.js'
import { buildReviewGenerationConfig, parseGeminiSseLine, STREAM_GENERATE_URL } from '../server/review/geminiClient.js'
import { scoreReview, summarize } from './score.js'

const { values: args } = parseArgs({
  options: {
    label: { type: 'string', default: new Date().toISOString().slice(0, 16).replace(':', '') },
    runs: { type: 'string', default: '1' },
    only: { type: 'string' },
    baseline: { type: 'string' },
  },
})

const key = process.env.GEMINI_API_KEY
if (!key) {
  console.error('GEMINI_API_KEY가 없습니다. .env.local에 넣거나 환경 변수로 넘겨 주세요.')
  process.exit(1)
}

const RATE_LIMIT_WAIT_MS = 30000
const MAX_RATE_LIMIT_RETRIES = 2

// 서버(reviewStreaming.js)와 같은 프롬프트·설정으로 스트리밍하고 첫 조각까지 걸린 시간을 잽니다.
async function generate(prompt, length) {
  for (let attempt = 0; ; attempt += 1) {
    const startedAt = performance.now()
    const response = await fetch(STREAM_GENERATE_URL, {
      method: 'POST',
      headers: createJsonHeaders({ 'x-goog-api-key': key }),
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: buildReviewGenerationConfig(length),
      }),
    })
    if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      console.log(`  429 — ${RATE_LIMIT_WAIT_MS / 1000}초 후 재시도`)
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_WAIT_MS))
      continue
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`)

    let review = ''
    let finishReason = null
    let ttftMs = null
    for await (const line of readLines(response.body)) {
      const chunk = parseGeminiSseLine(line)
      if (!chunk) continue
      finishReason = chunk.finishReason ?? finishReason
      if (!chunk.text) continue
      ttftMs ??= Math.round(performance.now() - startedAt)
      review += chunk.text
    }
    return { review, finishReason, ttftMs, totalMs: Math.round(performance.now() - startedAt) }
  }
}

const allCases = JSON.parse(await readFile(new URL('./cases.json', import.meta.url), 'utf8'))
const cases = args.only ? allCases.filter((c) => c.id.includes(args.only)) : allCases
const runs = Math.max(1, Number.parseInt(args.runs, 10) || 1)

const results = []
const failures = []
for (const testCase of cases) {
  const { prompt, safeLength, minReviewChars } = buildReviewPrompt(testCase)
  for (let run = 1; run <= runs; run += 1) {
    try {
      const generated = await generate(prompt, safeLength)
      const score = scoreReview({ ...generated, minReviewChars, testCase })
      results.push({ id: testCase.id, run, ...generated, score })
      const flags = [
        score.hallucinated && `근거 없음 ${[...score.unsupported, ...score.forbiddenHits].join('/')}`,
        score.missingKeywords.length && `빠진 키워드 ${score.missingKeywords.join('/')}`,
        score.tooShort && '짧음',
        score.truncated && '잘림',
      ].filter(Boolean)
      console.log(`${flags.length ? '✖' : '✔'} ${testCase.id}#${run} ${score.chars}자 ${flags.join(' · ')}`)
    } catch (err) {
      failures.push({ id: testCase.id, run, error: err.message })
      console.log(`! ${testCase.id}#${run} 실패: ${err.message}`)
    }
  }
}

const summary = summarize(results, failures.length)
await mkdir(new URL('./results/', import.meta.url), { recursive: true })
const outPath = new URL(`./results/${args.label}.json`, import.meta.url)
await writeFile(outPath, JSON.stringify({ label: args.label, summary, results, failures }, null, 2))

const pct = (v) => (v == null ? '-' : `${(v * 100).toFixed(1)}%`)
const ms = (v) => (v == null ? '-' : `${v}ms`)
const ROWS = [
  ['환각(근거 없는 숫자·영문·금지어)', 'hallucinationRate', pct],
  ['키워드 반영률', 'keywordCoverage', pct],
  ['최소 분량 미달', 'tooShortRate', pct],
  ['MAX_TOKENS 잘림', 'truncatedRate', pct],
  ['상투 문구 사용', 'genericPhraseRate', pct],
  ['첫 조각 지연 (중앙값)', 'medianTtftMs', ms],
  ['전체 생성 시간 (중앙값)', 'medianTotalMs', ms],
]

const baseline = args.baseline ? JSON.parse(await readFile(args.baseline, 'utf8')) : null
console.log(`\n${summary.runs}회 생성, 실패 ${summary.failed}회 → ${outPath.pathname}\n`)
console.log(baseline ? `| 지표 | ${baseline.label} | ${args.label} |\n|---|---|---|` : `| 지표 | ${args.label} |\n|---|---|`)
for (const [name, field, fmt] of ROWS) {
  const before = baseline ? ` ${fmt(baseline.summary[field])} |` : ''
  console.log(`| ${name} |${before} ${fmt(summary[field])} |`)
}

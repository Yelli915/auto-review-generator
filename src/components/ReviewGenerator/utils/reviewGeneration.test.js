import test from 'node:test'
import assert from 'node:assert/strict'
import { generateReview } from '../services/geminiService.js'
import { buildReviewGeneration, runReviewGeneration } from './reviewGeneration.js'
import { createReviewVersionState, openReviewVersion } from './reviewVersions.js'

const input = {
  sourceData: { category: 'place', subcategory: 'cafe', productContext: '넓은 좌석', userExperience: '예전 메모' },
  userExperience: '새로 입력한 경험', rating: 3, selectedKeywords: ['넓은 좌석'], length: 'long', tone: 'friendly',
}

function harness() {
  const original = createReviewVersionState({
    versions: Array.from({ length: 10 }, (_, index) => ({ n: index + 1, text: `원본 ${index + 1}` })),
    activeVersion: 4,
  })
  let state = original
  const usage = []
  return {
    original, usage, get state() { return state },
    dependencies: {
      ...buildReviewGeneration(input, null, null),
      generate: generateReview,
      openVersion(fields) {
        const previous = state
        state = openReviewVersion(state, fields)
        return () => { state = previous }
      },
      onChunk(text) {
        state = { ...state, versions: state.versions.map((version, index) => index === state.versions.length - 1 ? { ...version, text } : version) }
      },
      onUsage(value) { usage.push(value.remaining) },
    },
  }
}

test('an upstream failure before streaming restores all ten drafts and the original selection', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('네트워크 오류') })
  const h = harness()
  await assert.rejects(runReviewGeneration(h.dependencies), /네트워크 오류/)
  assert.strictEqual(h.state, h.original)
  assert.equal(h.state.versions[0].n, 1)
  assert.equal(h.state.activeVersion, 4)
})

test('a stream error discards partial text, restores versions, and retains refunded usage', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(
    '{"text":"미완성 초안"}\n{"error":"리뷰가 중간에 잘렸습니다.","remaining":20}\n',
    { headers: { 'X-Review-Remaining': '19', 'X-Review-Reset': '60' } },
  ))
  const h = harness()
  await assert.rejects(runReviewGeneration(h.dependencies), /중간에 잘렸습니다/)
  assert.strictEqual(h.state, h.original)
  assert.deepEqual(h.usage, [19, 20])
  assert.ok(h.state.versions.every((version) => !version.text.includes('미완성')))
})

test('a successful stream keeps the new completed version and its usage while enforcing the cap', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(
    '{"text":"넓은 좌석에서 "}\n{"text":"편히 쉬었어요."}\n{"done":true}\n',
    { headers: { 'X-Review-Remaining': '19', 'X-Review-Reset': '60' } },
  ))
  const h = harness()
  assert.equal(await runReviewGeneration(h.dependencies), true)
  assert.equal(h.state.versions.length, 10)
  assert.equal(h.state.versions[0].n, 2)
  assert.equal(h.state.versions.at(-1).n, 11)
  assert.equal(h.state.versions.at(-1).text, '넓은 좌석에서 편히 쉬었어요.')
  assert.equal(h.state.activeVersion, 9)
  assert.deepEqual(h.usage, [19])
})

test('new drafts use the current rating and experience with the selected keyword source', () => {
  const { request, fields } = buildReviewGeneration(input, null, null)
  assert.equal(request.category, 'place')
  assert.equal(request.subcategory, 'cafe')
  assert.equal(request.rating, 3)
  assert.match(request.productContext, /넓은 좌석/)
  assert.match(request.productContext, /새로 입력한 경험/)
  assert.doesNotMatch(request.productContext, /예전 메모/)
  assert.equal(fields.generationContext.productContext, request.productContext)
})

test('rewriting uses the original context, style, and keywords', () => {
  const generationContext = {
    category: 'product', subcategory: 'electronics', rating: 4,
    productContext: 'observedEvidence:\n리모컨 A100\n\nuserExperience:\n예전 메모',
  }
  const base = { n: 4, text: ' 원본 리뷰 ', keywords: ['조용한 음악'], length: 'short', tone: 'formal', generationContext }
  const rewrite = { label: '짧게', instruction: '간결하게 써 주세요.' }
  const { request, fields } = buildReviewGeneration(input, base, rewrite)
  assert.equal(request.previousReview, '원본 리뷰')
  assert.deepEqual(request.keywords, ['조용한 음악'])
  assert.equal(request.length, 'short')
  assert.equal(request.tone, 'formal')
  assert.equal(request.rating, 4)
  assert.equal(request.category, 'product')
  assert.equal(request.subcategory, 'electronics')
  assert.equal(request.productContext, generationContext.productContext)
  assert.equal(fields.from, 4)
  assert.deepEqual(fields.generationContext, generationContext)
})

test('rewriting older drafts recovers saved evidence and rating without adding current experience', () => {
  const productContext = 'observedEvidence:\n조용한 음악\n\nuserExperience:\n오래 머물렀어요'
  const base = { n: 2, text: '원본', evidence: `${productContext}\n별점: 4.5점` }
  const rewrite = { instruction: '간결하게 써 주세요.' }
  const { request, fields } = buildReviewGeneration(input, base, rewrite)
  assert.equal(request.productContext, productContext)
  assert.equal(request.rating, 4.5)
  assert.equal(request.category, 'place')
  assert.equal(request.subcategory, 'cafe')
  assert.equal(fields.generationContext.productContext, productContext)

  for (const [evidence, expected] of [['이전 입력만 있는 초안', '이전 입력만 있는 초안'], [undefined, '']]) {
    const { request } = buildReviewGeneration(input, { ...base, evidence }, rewrite)
    assert.equal(request.productContext, expected)
    assert.equal(request.rating, input.rating)
  }
})

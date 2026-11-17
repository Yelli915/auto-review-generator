import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canContinueWithProductInfo,
  hasConfirmedProductInfo,
  needsManualProductInfo,
  normalizeOptionGroups,
} from './workspaceContext.js'

// workspaceContext.js (상품 옵션)
const optionGroups = [
  {
    label: '색상',
    options: [
      { label: '블랙', value: 'black' },
      { label: '화이트', value: 'white' },
    ],
  },
  {
    label: '축',
    options: [
      { label: '저소음', value: 'silent' },
      { label: '갈축', value: 'brown' },
    ],
  },
]

test('normalizeOptionGroups keeps arrays and falls back to empty arrays', () => {
  assert.equal(normalizeOptionGroups(optionGroups), optionGroups)
  assert.deepEqual(normalizeOptionGroups(null), [])
})

test('manual product info helpers gate fallback analysis safely', () => {
  assert.equal(needsManualProductInfo({ analysisStatus: 'failed' }), true)
  assert.equal(needsManualProductInfo({ analysisStatus: 'ok' }), false)
  assert.equal(hasConfirmedProductInfo({ name: '무선 키보드' }), true)
  assert.equal(hasConfirmedProductInfo({ description: '조용한 키감' }), true)
  assert.equal(hasConfirmedProductInfo({ brand: '브랜드' }), false)
})

test('canContinueWithProductInfo requires manual product info only when needed', () => {
  assert.equal(
    canContinueWithProductInfo({
      analysis: { analysisStatus: 'failed' },
      optionGroups,
      product: { brand: '브랜드' },
      selections: ['black', 'silent'],
    }),
    false,
  )
  assert.equal(
    canContinueWithProductInfo({
      analysis: { analysisStatus: 'failed' },
      optionGroups,
      product: { description: '조용한 키감' },
      selections: ['black', 'silent'],
    }),
    true,
  )
  assert.equal(
    canContinueWithProductInfo({
      analysis: { analysisStatus: 'ok' },
      optionGroups: [],
      product: {},
      selections: [],
    }),
    true,
  )
})

// draftStorage.js
test('sanitizeDraft ignores other versions and drops malformed fields', async () => {
  const { sanitizeDraft } = await import('./draftStorage.js')
  assert.equal(sanitizeDraft({ v: 0, category: 'place' }), null)
  assert.equal(sanitizeDraft(null), null)

  const draft = sanitizeDraft({
    v: 1,
    category: 'product',
    inputMode: 'weird',
    keywords: ['조명 은은함', 3, null],
    versions: [{ text: '좋았어요', n: 1, keywords: 'x' }, { n: 2 }, { text: 'n 없음' }],
    rating: 'abc',
    productAnalysis: {
      optionGroups: [
        { label: '색상', options: [{ value: '블랙' }, { value: '화이트' }] },
        { label: '크기', options: [{ value: 'S' }, { value: 'M' }] },
      ],
    },
    optionSelections: ['없는값', 'M'],
  })
  assert.equal(draft.inputMode, 'image')
  assert.deepEqual(draft.keywords, ['조명 은은함'])
  assert.equal(draft.versions.length, 1)
  assert.deepEqual(draft.versions[0].keywords, [])
  assert.equal(draft.rating, 5)
  assert.deepEqual(draft.optionSelections, ['블랙', 'M'])
})

// keywordHighlight.js
test('splitKeywordHighlights marks inflected keyword words and keeps punctuation outside', async () => {
  const { splitKeywordHighlights } = await import('./keywordHighlight.js')
  const segments = splitKeywordHighlights(
    '은은한 조명 덕분에 좋았고, 라떼가 고소했어요.',
    ['조명 은은함', '라떼 고소함'],
  )
  assert.equal(segments.map((s) => s.text).join(''), '은은한 조명 덕분에 좋았고, 라떼가 고소했어요.')
  assert.deepEqual(
    segments.filter((s) => s.keyword).map((s) => [s.text, s.keyword]),
    [
      ['은은한', '조명 은은함'],
      ['조명', '조명 은은함'],
      ['라떼가', '라떼 고소함'],
      ['고소했어요', '라떼 고소함'],
    ],
  )
  assert.deepEqual(splitKeywordHighlights('그냥 좋았어요', []), [{ text: '그냥 좋았어요', keyword: null }])
})

// workspaceContext.js
test('workspace context builds the evidence text sent to keyword and review prompts', async () => {
  const { appendProductContext, buildEvidenceContext, buildOptionSummary } = await import('./workspaceContext.js')
  const optionGroups = [{ label: '색상', options: [{ value: 'bk', label: '블랙' }] }, { label: '크기', options: [] }]
  const summary = buildOptionSummary(optionGroups, ['bk'])
  assert.equal(summary, '색상: 블랙\n크기: 미선택')

  const source = appendProductContext(
    { productContext: '페이지 원문', userExperience: ' 한 달 사용 ' },
    { name: '무선 마우스', url: 'https://example.com/p/1' },
    summary,
  )
  assert.equal(
    buildEvidenceContext(source),
    'observedEvidence:\n확인된 상품 정보:\n상품명: 무선 마우스\n링크: https://example.com/p/1\n\n선택 옵션:\n색상: 블랙\n크기: 미선택\n\nuserExperience:\n한 달 사용',
  )
  // 상품 정보가 비어 있으면 페이지에서 읽은 근거를 그대로 씁니다.
  assert.equal(appendProductContext({ productContext: '원문' }, {}, '').productContext, '원문')
})

test('keyword selection helpers keep custom picks and toggle the full set', async () => {
  const { withAllKeywordsToggled, withCustomKeyword, withNewKeywords, withoutCustomKeyword, withToggledKeyword } =
    await import('./workspaceContext.js')
  const prev = { keywords: ['맛', '가격'], customKeywords: ['친절'], selectedKeywords: ['가격', '친절'] }

  // 새 키워드에 남은 선택과 직접 추가한 키워드만 유지합니다.
  assert.deepEqual(withNewKeywords(prev, ['가격', '양']).selectedKeywords, ['가격', '친절'])
  // 남은 선택이 없으면 새 키워드와 직접 추가한 키워드를 전부 고릅니다.
  assert.deepEqual(
    withNewKeywords({ ...prev, selectedKeywords: ['맛'] }, ['양', '친절']).selectedKeywords,
    ['양', '친절'],
  )

  assert.deepEqual(withToggledKeyword(prev, '가격').selectedKeywords, ['친절'])
  assert.deepEqual(withToggledKeyword(prev, '맛').selectedKeywords, ['가격', '친절', '맛'])
  assert.deepEqual(withAllKeywordsToggled(prev).selectedKeywords, ['맛', '가격', '친절'])
  assert.deepEqual(withAllKeywordsToggled({ ...prev, selectedKeywords: ['맛', '가격', '친절'] }).selectedKeywords, [])

  assert.deepEqual(withCustomKeyword(prev, '청결'), {
    customKeywords: ['친절', '청결'],
    selectedKeywords: ['가격', '친절', '청결'],
  })
  assert.deepEqual(withoutCustomKeyword(prev, '친절'), { customKeywords: [], selectedKeywords: ['가격'] })
})

test('findMissingKeywords returns keywords whose stems never appear in the review', async () => {
  const { findMissingKeywords } = await import('./keywordHighlight.js')
  const text = '은은한 조명 덕분에 분위기가 좋았어요.'
  assert.deepEqual(findMissingKeywords(text, ['조명 은은함', '주차 편함', '맛']), ['주차 편함', '맛'])
  assert.deepEqual(findMissingKeywords('맛있고 편했어요.', ['맛', '편함']), [])
  // 두 글자 어간이 있으면 흔한 한 글자 어간("좋")만으로 들어간 것으로 보지 않습니다.
  assert.deepEqual(findMissingKeywords('정말 좋았어요.', ['가성비 좋음']), ['가성비 좋음'])
  assert.deepEqual(findMissingKeywords('', ['조명']), [])
})

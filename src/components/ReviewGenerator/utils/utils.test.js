import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CROP_MODES,
  calculateCanvasSize,
  calculateCropRect,
  cropRectKey,
  normalizeInteractiveCropRect,
  normalizeRotation,
} from './imageUtils.js'
import {
  canContinueWithProductInfo,
  hasConfirmedProductInfo,
  needsManualProductInfo,
  normalizeOptionGroups,
} from './productOptions.js'

// imageUtils.js
test('calculateCropRect returns full image for original crop mode', () => {
  assert.deepEqual(calculateCropRect(1200, 800, CROP_MODES.original), {
    x: 0,
    y: 0,
    width: 1200,
    height: 800,
  })
})

test('calculateCropRect returns centered square crop', () => {
  assert.deepEqual(calculateCropRect(1200, 800, CROP_MODES.square), {
    x: 200,
    y: 0,
    width: 800,
    height: 800,
  })
})

test('calculateCropRect returns centered 4:3 crop', () => {
  assert.deepEqual(calculateCropRect(1600, 900, CROP_MODES.ratio4x3), {
    x: 200,
    y: 0,
    width: 1200,
    height: 900,
  })
  assert.deepEqual(calculateCropRect(900, 1600, CROP_MODES.ratio4x3), {
    x: 0,
    y: 463,
    width: 900,
    height: 675,
  })
})

test('calculateCropRect returns custom free crop', () => {
  assert.deepEqual(
    calculateCropRect(1000, 800, CROP_MODES.free, {
      x: 0.1,
      y: 0.2,
      width: 0.5,
      height: 0.4,
    }),
    {
      x: 100,
      y: 160,
      width: 500,
      height: 320,
    },
  )
})

test('normalizeRotation keeps rotation values within 0 to 359 degrees', () => {
  assert.equal(normalizeRotation(450), 90)
  assert.equal(normalizeRotation(-90), 270)
  assert.equal(normalizeRotation(undefined), 0)
})

test('calculateCanvasSize swaps dimensions for sideways rotation', () => {
  assert.deepEqual(calculateCanvasSize(1200, 800, 0), {
    width: 1200,
    height: 800,
  })
  assert.deepEqual(calculateCanvasSize(1200, 800, 90), {
    width: 800,
    height: 1200,
  })
  assert.deepEqual(calculateCanvasSize(1200, 800, 270), {
    width: 800,
    height: 1200,
  })
  assert.deepEqual(calculateCanvasSize(1200, 800, 180), {
    width: 1200,
    height: 800,
  })
})

test('normalizeInteractiveCropRect clamps editor crop state', () => {
  assert.deepEqual(
    normalizeInteractiveCropRect({
      x: 0.95,
      y: -0.2,
      width: 0.02,
      height: 2,
    }),
    {
      x: 0.9,
      y: 0,
      width: 0.1,
      height: 1,
    },
  )
})

test('cropRectKey creates a stable percentage signature', () => {
  assert.equal(
    cropRectKey({
      x: 0.081,
      y: 0.084,
      width: 0.836,
      height: 0.842,
    }),
    '8:8:84:84',
  )
})

// productOptions.js
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

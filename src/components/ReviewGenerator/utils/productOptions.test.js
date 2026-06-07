import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canContinueWithProductInfo,
  hasConfirmedProductInfo,
  mergeOptionSelections,
  needsManualProductInfo,
  normalizeOptionGroups,
} from './productOptions.js'

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

test('mergeOptionSelections keeps valid selections and replaces invalid values', () => {
  assert.deepEqual(mergeOptionSelections(optionGroups, ['white', 'invalid']), [
    'white',
    'silent',
  ])
  assert.deepEqual(mergeOptionSelections(optionGroups), ['black', 'silent'])
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

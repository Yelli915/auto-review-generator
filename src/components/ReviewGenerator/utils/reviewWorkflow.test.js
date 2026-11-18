import test from 'node:test'
import assert from 'node:assert/strict'
import { getComposeAction, getResumeView, hasWorkspaceContent } from './reviewWorkflow.js'

function workspace(overrides = {}) {
  return {
    versions: [], hasSource: false, upload: { images: [], isProcessing: false }, missingImageCount: 0,
    category: 'place', subcategory: '', rating: 5, productUrl: '', userExperience: '',
    productAnalysis: null, isLinkMode: false, productUrlChanged: false,
    keywordsStale: false, canBuildKeywords: false,
    ...overrides,
  }
}

test('resuming a workspace opens the furthest usable stage without requiring image reupload', () => {
  assert.equal(getResumeView(workspace()), 'compose')
  assert.equal(getResumeView(workspace({ hasSource: true })), 'keywords')
  assert.equal(getResumeView(workspace({ hasSource: true, versions: [{ n: 1, text: '초안' }] })), 'draft')
})

test('a saved keyword source can continue even when its original images are not stored', () => {
  const action = getComposeAction(workspace({ hasSource: true }))
  assert.equal(action.kind, 'continue')
  assert.equal(action.disabled, false)
})

test('a fresh workspace cannot request keywords until its source is ready', () => {
  assert.equal(getComposeAction(workspace()).disabled, true)
  const ready = getComposeAction(workspace({ canBuildKeywords: true, upload: { images: [{}] } }))
  assert.equal(ready.kind, 'build')
  assert.equal(ready.disabled, false)
})

test('a changed product URL requires analysis before generating with the previous product', () => {
  const action = getComposeAction(workspace({
    hasSource: true, isLinkMode: true, productAnalysis: { url: 'https://example.com/old' },
    productUrl: 'https://example.com/new', productUrlChanged: true, canBuildKeywords: true,
  }))
  assert.equal(action.kind, 'analyze')
  assert.equal(action.disabled, false)
  assert.equal(getComposeAction(workspace({ isLinkMode: true })).disabled, true)
})

test('an incomplete manual product cannot advance to keyword generation', () => {
  const manual = workspace({ isLinkMode: true, productAnalysis: { needsManualInput: true } })
  assert.equal(getComposeAction(manual).kind, 'build')
  assert.equal(getComposeAction(manual).disabled, true)
  assert.equal(getComposeAction({ ...manual, canBuildKeywords: true }).disabled, false)
})

test('stale keywords do not silently skip regeneration after the input changes', () => {
  const action = getComposeAction(workspace({ hasSource: true, keywordsStale: true }))
  assert.equal(action.kind, 'build')
  assert.equal(action.disabled, true)
})

test('a new review protects partial input as well as completed drafts from replacement', () => {
  assert.equal(hasWorkspaceContent(workspace()), false)
  for (const change of [
    { userExperience: '좋았던 경험' }, { productUrl: 'https://example.com/product' },
    { upload: { images: [{}] } }, { upload: { images: [], isProcessing: true } }, { missingImageCount: 1 },
    { rating: 3 }, { category: 'product' },
    { subcategory: 'cafe' }, { hasSource: true }, { versions: [{ n: 1 }] },
  ]) assert.equal(hasWorkspaceContent(workspace(change)), true)
})

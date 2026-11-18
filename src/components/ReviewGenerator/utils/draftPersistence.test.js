import test from 'node:test'
import assert from 'node:assert/strict'
import { createDraftPersistence } from './draftPersistence.js'
import { loadDraft, saveDraft } from './draftStorage.js'

function harness() {
  const writes = []
  const timers = new Map()
  let nextId = 0
  const persistence = createDraftPersistence((snapshot) => writes.push(snapshot), {
    schedule(callback) { timers.set(++nextId, callback); return nextId },
    cancel(id) { timers.delete(id) },
  })
  return { persistence, writes, timers, tick() { for (const callback of [...timers.values()]) callback() } }
}

test('draft persistence coalesces typing and saves the latest input and selected version', () => {
  const { persistence, writes, timers, tick } = harness()
  persistence.update({ userExperience: '처음 입력', activeVersion: 0 })
  persistence.update({ userExperience: '마지막 입력', activeVersion: 2 })
  assert.equal(writes.length, 0)
  assert.equal(timers.size, 1)
  tick()
  assert.deepEqual(writes, [{ userExperience: '마지막 입력', activeVersion: 2 }])
  persistence.flush()
  assert.equal(writes.length, 1)
})

test('pagehide during streaming flushes the last complete draft instead of partial text', () => {
  const { persistence, writes, timers } = harness()
  const complete = { versions: [{ n: 1, text: '완성된 리뷰' }], activeVersion: 0 }
  persistence.update(complete)
  persistence.update({ versions: [{ n: 2, text: '미완성' }], activeVersion: 1 }, true)
  assert.equal(timers.size, 0)
  persistence.flush()
  assert.deepEqual(writes, [complete])
})

test('streaming a first draft never persists partial text and resumes saving on completion', () => {
  const { persistence, writes, tick } = harness()
  persistence.update({ versions: [{ n: 1, text: '미완성' }] }, true)
  persistence.flush()
  assert.equal(writes.length, 0)
  const complete = { versions: [{ n: 1, text: '완성된 리뷰' }] }
  persistence.update(complete)
  tick()
  assert.deepEqual(writes, [complete])
})

test('disposing a reset workspace cancels queued saves so the cleared draft stays cleared', () => {
  const { persistence, writes, timers, tick } = harness()
  persistence.update({ userExperience: '지워야 할 입력' })
  persistence.dispose()
  tick()
  persistence.flush()
  assert.equal(timers.size, 0)
  assert.deepEqual(writes, [])
})

test('a refresh restores input, custom keyword selection, version evidence, and active version', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const storage = new Map()
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  })
  try {
    saveDraft({
      category: 'place', subcategory: 'cafe', inputMode: 'image', imageCount: 2,
      rating: 3, userExperience: '조용해서 쉬기 좋았어요.',
      sourceData: { category: 'place', images: [], userExperience: '기존 경험' },
      keywords: ['넓은 좌석'], customKeywords: ['조용한 음악'], selectedKeywords: ['조용한 음악'],
      length: 'long', tone: 'friendly', keywordsStale: true,
      versions: [{ n: 1, text: '원본' }, { n: 2, text: '수정본', from: 1, keywords: ['조용한 음악'], evidence: '사용자 경험', note: '직접 다듬기' }],
      activeVersion: 1,
    })
    const restored = loadDraft()
    assert.equal(restored.userExperience, '조용해서 쉬기 좋았어요.')
    assert.equal(restored.subcategory, 'cafe')
    assert.equal(restored.imageCount, 2)
    assert.deepEqual(restored.sourceData.images, [])
    assert.deepEqual(restored.selectedKeywords, ['조용한 음악'])
    assert.equal(restored.keywordsStale, true)
    assert.equal(restored.activeVersion, 1)
    assert.equal(restored.versions[1].from, 1)
    assert.equal(restored.versions[1].evidence, '사용자 경험')
    assert.equal(restored.length, 'long')
    assert.equal(restored.tone, 'friendly')
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'sessionStorage', descriptor)
    else delete globalThis.sessionStorage
  }
})

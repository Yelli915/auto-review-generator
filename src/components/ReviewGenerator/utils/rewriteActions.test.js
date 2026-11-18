import test from 'node:test'
import assert from 'node:assert/strict'
import { createCustomRewrite, createMissingKeywordsRewrite, createPickedRewrite, createUnsupportedRewrite, submitCustomRewrite } from './rewriteActions.js'

test('a failed custom rewrite retains the exact user input for retry', async () => {
  const value = '  가격 이야기는 빼고 더 친근하게 써 주세요.  '
  let submitted
  assert.equal(await submitCustomRewrite(value, async (action) => { submitted = action; return undefined }), value)
  assert.equal(submitted.instruction, value.trim())
})

test('only a successful custom rewrite clears the input and blank requests are not submitted', async () => {
  assert.equal(await submitCustomRewrite('조금 더 짧게 써 주세요.', async () => true), '')
  assert.equal(await submitCustomRewrite('   ', () => assert.fail('빈 요청을 제출하면 안 됩니다.')), '   ')
})

test('custom rewrite labels do not split emoji when shortened', () => {
  const action = createCustomRewrite('🙂'.repeat(22))
  assert.equal(action.label, `요청: ${'🙂'.repeat(20)}`)
  assert.equal(action.instruction, '🙂'.repeat(22))
})

test('targeted rewrites distinguish replacing an expression, removing a topic, and evidence fixes', () => {
  const picked = { word: '좌석이', keyword: '넓은 좌석' }
  assert.match(createPickedRewrite(picked, 'swap').instruction, /"좌석이" 부분만/)
  assert.match(createPickedRewrite(picked, 'remove').instruction, /"넓은 좌석"에 관한 내용만/)
  assert.match(createMissingKeywordsRewrite(['좌석', '조명']).instruction, /"좌석", "조명"/)
  assert.match(createUnsupportedRewrite(['300g', 'ACME']).instruction, /"300g", "ACME"/)
})

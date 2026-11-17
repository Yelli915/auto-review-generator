import assert from 'node:assert/strict'
import test from 'node:test'
import { findUnsupportedTokens } from './evidenceCheck.js'

test('findUnsupportedTokens flags numbers and latin words missing from source', () => {
  const source = '상품명: 로지텍 MX Keys\n가격 정보: 129,000원'
  const review = 'MX Keys는 129,000원에 샀는데 Logitech 앱으로 3대까지 연결돼요.'

  assert.deepEqual(findUnsupportedTokens(review, source), ['3', 'Logitech'])
})

test('findUnsupportedTokens accepts tokens present in source and empty review', () => {
  assert.deepEqual(findUnsupportedTokens('Keychron K8 키감이 좋아요.', '브랜드: Keychron\n상품명: K8'), [])
  assert.deepEqual(findUnsupportedTokens('', 'x'), [])
})

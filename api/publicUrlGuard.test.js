import assert from 'node:assert/strict'
import test from 'node:test'
import { isBlockedIpAddress } from './publicUrlGuard.js'

test('isBlockedIpAddress blocks IPv6 forms that can wrap internal IPv4', () => {
  for (const ip of ['::7f00:1', '64:ff9b::a00:1', '2002:7f00:1::', 'fec0::1']) {
    assert.equal(isBlockedIpAddress(ip), true, ip)
  }
  assert.equal(isBlockedIpAddress('::ffff:8.8.8.8'), false)
  assert.equal(isBlockedIpAddress('2606:4700:4700::1111'), false)
})

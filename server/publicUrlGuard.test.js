import assert from 'node:assert/strict'
import test from 'node:test'
import { isBlockedIpAddress, lookupPublicAddress } from './publicUrlGuard.js'

test('isBlockedIpAddress blocks IPv6 forms that can wrap internal IPv4', () => {
  for (const ip of [
    '::7f00:1',
    '64:ff9b::a00:1',
    '2002:7f00:1::',
    '2002:a00::1',
    '2001:0:4136:e378:8000:63bf:3fff:fdd2',
    'fec0::1',
  ]) {
    assert.equal(isBlockedIpAddress(ip), true, ip)
  }
  assert.equal(isBlockedIpAddress('::ffff:8.8.8.8'), false)
  // 6to4는 폐기된 대역이라 공인 IPv4를 감싸도 막습니다.
  assert.equal(isBlockedIpAddress('2002:808:808::1'), true)
  assert.equal(isBlockedIpAddress('2606:4700:4700::1111'), false)
})

test('lookupPublicAddress refuses hostnames that resolve to blocked addresses at connect time', async () => {
  const lookup = (host) =>
    new Promise((resolve) => lookupPublicAddress(host, { all: true }, (err, address) => resolve({ err, address })))
  assert.equal((await lookup('localhost')).err?.code, 'EBLOCKEDADDR')
})

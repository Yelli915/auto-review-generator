import assert from 'node:assert/strict'
import test from 'node:test'
import { isBlockedIpAddress, validatePublicHttpUrl } from './publicUrlGuard.js'

test('isBlockedIpAddress blocks private and reserved IPv4 ranges', () => {
  assert.equal(isBlockedIpAddress('10.0.0.5'), true)
  assert.equal(isBlockedIpAddress('127.0.0.1'), true)
  assert.equal(isBlockedIpAddress('169.254.1.1'), true)
  assert.equal(isBlockedIpAddress('172.16.0.1'), true)
  assert.equal(isBlockedIpAddress('172.31.255.255'), true)
  assert.equal(isBlockedIpAddress('192.168.0.1'), true)
  assert.equal(isBlockedIpAddress('100.64.0.1'), true)
  assert.equal(isBlockedIpAddress('0.0.0.0'), true)
  assert.equal(isBlockedIpAddress('192.0.2.1'), true)
  assert.equal(isBlockedIpAddress('198.51.100.1'), true)
  assert.equal(isBlockedIpAddress('203.0.113.1'), true)
  assert.equal(isBlockedIpAddress('224.0.0.1'), true)
  assert.equal(isBlockedIpAddress('240.0.0.1'), true)
})

test('isBlockedIpAddress allows public IPv4 addresses', () => {
  assert.equal(isBlockedIpAddress('8.8.8.8'), false)
  assert.equal(isBlockedIpAddress('172.15.255.255'), false)
  assert.equal(isBlockedIpAddress('172.32.0.0'), false)
})

test('isBlockedIpAddress blocks IPv6 loopback, unique local, link-local, and multicast', () => {
  assert.equal(isBlockedIpAddress('::1'), true)
  assert.equal(isBlockedIpAddress('::'), true)
  assert.equal(isBlockedIpAddress('fc00::1'), true)
  assert.equal(isBlockedIpAddress('fd12:3456::1'), true)
  assert.equal(isBlockedIpAddress('fe80::1'), true)
  assert.equal(isBlockedIpAddress('ff02::1'), true)
})

test('isBlockedIpAddress allows public IPv6 addresses', () => {
  assert.equal(isBlockedIpAddress('2001:4860:4860::8888'), false)
})

test('isBlockedIpAddress blocks IPv4-mapped IPv6 addresses pointing to private ranges', () => {
  assert.equal(isBlockedIpAddress('::ffff:127.0.0.1'), true)
  assert.equal(isBlockedIpAddress('::ffff:10.0.0.1'), true)
  assert.equal(isBlockedIpAddress('::ffff:8.8.8.8'), false)
})

test('isBlockedIpAddress rejects malformed input safely', () => {
  assert.equal(isBlockedIpAddress(''), false)
  assert.equal(isBlockedIpAddress('not-an-ip'), false)
  assert.equal(isBlockedIpAddress(undefined), false)
})

test('validatePublicHttpUrl accepts a well-formed public https URL', async () => {
  const result = await validatePublicHttpUrl('https://example.com/product/123', {
    resolveDns: false,
  })
  assert.equal(result.ok, true)
  assert.equal(result.url, 'https://example.com/product/123')
})

test('validatePublicHttpUrl rejects empty or non-string input', async () => {
  assert.equal((await validatePublicHttpUrl('')).ok, false)
  assert.equal((await validatePublicHttpUrl('   ')).ok, false)
  assert.equal((await validatePublicHttpUrl(null)).ok, false)
})

test('validatePublicHttpUrl rejects URLs longer than maxLength', async () => {
  const longUrl = `https://example.com/${'a'.repeat(3000)}`
  const result = await validatePublicHttpUrl(longUrl)
  assert.equal(result.ok, false)
  assert.equal(result.status, 400)
})

test('validatePublicHttpUrl rejects unparsable URLs', async () => {
  const result = await validatePublicHttpUrl('not a url')
  assert.equal(result.ok, false)
  assert.equal(result.status, 400)
})

test('validatePublicHttpUrl rejects non-http(s) protocols', async () => {
  assert.equal((await validatePublicHttpUrl('ftp://example.com')).ok, false)
  assert.equal((await validatePublicHttpUrl('file:///etc/passwd')).ok, false)
  assert.equal(
    (await validatePublicHttpUrl('javascript:alert(1)')).ok,
    false,
  )
})

test('validatePublicHttpUrl rejects URLs carrying embedded credentials', async () => {
  const result = await validatePublicHttpUrl('https://user:pass@example.com')
  assert.equal(result.ok, false)
  assert.match(result.error, /인증 정보/)
})

test('validatePublicHttpUrl blocks localhost and *.localhost hostnames', async () => {
  assert.equal((await validatePublicHttpUrl('http://localhost')).ok, false)
  assert.equal(
    (await validatePublicHttpUrl('http://foo.localhost:3000')).ok,
    false,
  )
})

test('validatePublicHttpUrl blocks literal private-network and metadata hosts', async () => {
  assert.equal((await validatePublicHttpUrl('http://127.0.0.1')).ok, false)
  assert.equal((await validatePublicHttpUrl('http://10.0.0.1')).ok, false)
  assert.equal((await validatePublicHttpUrl('http://192.168.1.1')).ok, false)
  assert.equal(
    (await validatePublicHttpUrl('http://metadata.google.internal')).ok,
    false,
  )
})

test('validatePublicHttpUrl blocks IPv4-mapped IPv6 hosts pointing to private ranges', async () => {
  const result = await validatePublicHttpUrl('http://[::ffff:127.0.0.1]', {
    resolveDns: false,
  })
  assert.equal(result.ok, false)
})

test('validatePublicHttpUrl uses the provided errorMessage for blocked hosts', async () => {
  const result = await validatePublicHttpUrl('http://localhost', {
    errorMessage: '커스텀 에러 메시지',
  })
  assert.equal(result.ok, false)
  assert.equal(result.error, '커스텀 에러 메시지')
})

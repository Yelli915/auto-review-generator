import assert from 'node:assert/strict'
import test from 'node:test'
import { readLines } from './streamLines.js'

test('readLines joins lines split across chunks and keeps the last unterminated line', async () => {
  const bytes = new TextEncoder().encode('a\nb가')
  // '가'(3바이트)를 가운데서 잘라 여러 덩어리로 보냅니다.
  const chunks = [bytes.slice(0, 3), bytes.slice(3, 5), bytes.slice(5)]
  const body = new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk))
      controller.close()
    },
  })
  const lines = []
  for await (const line of readLines(body)) lines.push(line)
  assert.deepEqual(lines, ['a', 'b가'])
})

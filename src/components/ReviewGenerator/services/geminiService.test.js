import assert from 'node:assert/strict'
import test from 'node:test'
import { createReviewStreamAccumulator } from './geminiService.js'

test('createReviewStreamAccumulator appends text chunks and emits full text', () => {
  const chunks = []
  const stream = createReviewStreamAccumulator((text) => chunks.push(text))

  stream.appendLine('{"text":"hello"}')
  stream.appendLine('{"text":" world"}')

  assert.deepEqual(chunks, ['hello', 'hello world'])
  assert.equal(stream.getError(), '')
  assert.equal(stream.isComplete(), false)
  stream.appendLine('{"done":true}')
  assert.equal(stream.isComplete(), true)
})

test('createReviewStreamAccumulator captures stream errors and ignores invalid lines', () => {
  const stream = createReviewStreamAccumulator()

  stream.appendLine('not json')
  stream.appendLine('{"error":" upstream failed "}')

  assert.equal(stream.getError(), 'upstream failed')
})

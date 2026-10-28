import assert from 'node:assert/strict'
import test from 'node:test'
import { createReviewStreamAccumulator } from './reviewStream.js'

test('createReviewStreamAccumulator appends text chunks and emits full text', () => {
  const chunks = []
  const stream = createReviewStreamAccumulator((text) => chunks.push(text))

  stream.appendLine('{"text":"hello"}')
  stream.appendLine('{"text":" world"}')

  assert.equal(stream.getText(), 'hello world')
  assert.deepEqual(chunks, ['hello', 'hello world'])
  assert.equal(stream.getError(), '')
})

test('createReviewStreamAccumulator captures stream errors and ignores invalid lines', () => {
  const stream = createReviewStreamAccumulator()

  stream.appendLine('not json')
  stream.appendLine('{"error":" upstream failed "}')

  assert.equal(stream.getText(), '')
  assert.equal(stream.getError(), 'upstream failed')
})

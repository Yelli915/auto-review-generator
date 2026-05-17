import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CROP_MODES,
  calculateCropRect,
  normalizeRotation,
} from './imageUtils.js'

test('calculateCropRect returns full image for original crop mode', () => {
  assert.deepEqual(calculateCropRect(1200, 800, CROP_MODES.original), {
    x: 0,
    y: 0,
    width: 1200,
    height: 800,
  })
})

test('calculateCropRect returns centered square crop', () => {
  assert.deepEqual(calculateCropRect(1200, 800, CROP_MODES.square), {
    x: 200,
    y: 0,
    width: 800,
    height: 800,
  })
})

test('calculateCropRect returns centered 4:3 crop', () => {
  assert.deepEqual(calculateCropRect(1600, 900, CROP_MODES.ratio4x3), {
    x: 200,
    y: 0,
    width: 1200,
    height: 900,
  })
  assert.deepEqual(calculateCropRect(900, 1600, CROP_MODES.ratio4x3), {
    x: 0,
    y: 463,
    width: 900,
    height: 675,
  })
})

test('normalizeRotation keeps rotation values within 0 to 359 degrees', () => {
  assert.equal(normalizeRotation(450), 90)
  assert.equal(normalizeRotation(-90), 270)
  assert.equal(normalizeRotation(undefined), 0)
})

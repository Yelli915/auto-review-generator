import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CROP_MODES,
  areCropAreasEqual,
  calculateCanvasSize,
  calculateCropRect,
  createCropAreaFromPoints,
  normalizeCropArea,
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

test('calculateCropRect returns free rectangle crop', () => {
  assert.deepEqual(
    calculateCropRect(1000, 800, CROP_MODES.free, {
      x: 0.2,
      y: 0.25,
      width: 0.5,
      height: 0.4,
    }),
    {
      x: 200,
      y: 200,
      width: 500,
      height: 320,
    },
  )
})

test('normalizeCropArea clamps free rectangle values inside image bounds', () => {
  assert.deepEqual(
    normalizeCropArea({
      x: 0.75,
      y: -0.2,
      width: 0.4,
      height: 2,
    }),
    {
      x: 0.75,
      y: 0,
      width: 0.25,
      height: 1,
    },
  )
})

test('areCropAreasEqual compares normalized crop rectangles', () => {
  assert.equal(
    areCropAreasEqual(
      { x: 0.2, y: 0.1, width: 0.5, height: 0.6 },
      { x: 0.2, y: 0.1, width: 0.5, height: 0.6 },
    ),
    true,
  )
  assert.equal(
    areCropAreasEqual(
      { x: 0.2, y: 0.1, width: 0.5, height: 0.6 },
      { x: 0.2, y: 0.1, width: 0.4, height: 0.6 },
    ),
    false,
  )
})

test('createCropAreaFromPoints supports reverse drag direction', () => {
  assert.deepEqual(
    createCropAreaFromPoints(
      { x: 0.75, y: 0.8 },
      { x: 0.25, y: 0.3 },
    ),
    {
      x: 0.25,
      y: 0.3,
      width: 0.5,
      height: 0.5,
    },
  )
})

test('normalizeRotation keeps rotation values within 0 to 359 degrees', () => {
  assert.equal(normalizeRotation(450), 90)
  assert.equal(normalizeRotation(-90), 270)
  assert.equal(normalizeRotation(undefined), 0)
})

test('calculateCanvasSize swaps dimensions for sideways rotation', () => {
  assert.deepEqual(calculateCanvasSize(1200, 800, 0), {
    width: 1200,
    height: 800,
  })
  assert.deepEqual(calculateCanvasSize(1200, 800, 90), {
    width: 800,
    height: 1200,
  })
  assert.deepEqual(calculateCanvasSize(1200, 800, 270), {
    width: 800,
    height: 1200,
  })
  assert.deepEqual(calculateCanvasSize(1200, 800, 180), {
    width: 1200,
    height: 800,
  })
})

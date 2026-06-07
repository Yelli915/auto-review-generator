import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getReviewSubcategoryMeta,
  normalizeReviewCategory,
  normalizeReviewSubcategory,
} from './reviewCategories.js'

test('normalizeReviewCategory accepts known categories and falls back safely', () => {
  assert.equal(normalizeReviewCategory('place'), 'place')
  assert.equal(normalizeReviewCategory('product'), 'product')
  assert.equal(normalizeReviewCategory('unknown'), 'place')
  assert.equal(normalizeReviewCategory(undefined), 'place')
})

test('normalizeReviewSubcategory accepts matching subcategories and falls back safely', () => {
  assert.equal(normalizeReviewSubcategory('place', 'restaurant'), 'restaurant')
  assert.equal(normalizeReviewSubcategory('product', 'beauty'), 'beauty')
  assert.equal(normalizeReviewSubcategory('place', 'beauty'), '')
  assert.equal(normalizeReviewSubcategory('product', undefined), '')
})

test('getReviewSubcategoryMeta returns metadata for valid subcategories', () => {
  assert.equal(getReviewSubcategoryMeta('place', 'cafe')?.label, '카페')
  assert.equal(getReviewSubcategoryMeta('product', 'electronics')?.label, '전자기기')
  assert.equal(getReviewSubcategoryMeta('place', 'electronics'), null)
})

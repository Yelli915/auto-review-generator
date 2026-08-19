import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appendKeywordRetryGuidance,
  isSameKeywordSet,
  sanitizeKeywordArray,
} from './keywordSets.js'
import {
  filterCosmeticContainerKeywords,
  isCosmeticContainerOnlyKeyword,
} from './keywordFiltering.js'
import { parseKeywordsFromText } from './keywordParsing.js'

test('sanitizeKeywordArray keeps short Hangul phrases and removes invalid values', () => {
  assert.deepEqual(
    sanitizeKeywordArray([
      '배송 빠름',
      '배송 빠름',
      '색감 좋음',
      'too long english only',
      '추천해요',
      '제품 인식 서술하기',
      '누수 문제 점검하기',
      '모델 응답 과정',
      '사진 분석 과정',
      '프롬프트 지시문',
      '이미지 분석',
      '',
    ]),
    ['배송 빠름', '색감 좋음'],
  )
})

test('isCosmeticContainerOnlyKeyword blocks container-centered keywords but keeps usage-impact exceptions', () => {
  assert.equal(isCosmeticContainerOnlyKeyword('펌프 용기 편함'), true)
  assert.equal(isCosmeticContainerOnlyKeyword('케이스 패키지 깔끔'), true)
  assert.equal(isCosmeticContainerOnlyKeyword('펌프 불량 아쉬움'), false)
  assert.equal(isCosmeticContainerOnlyKeyword('휴대성 좋은 튜브'), false)
  assert.equal(isCosmeticContainerOnlyKeyword('촉촉한 보습감'), false)
})

test('filterCosmeticContainerKeywords removes cosmetic container-only keywords', () => {
  const result = filterCosmeticContainerKeywords(
    ['펌프 용기 편함', '촉촉한 보습감', '부드러운 발림성', '패키지 깔끔'],
    {
      category: 'product',
      productContext: '상품명: 수분 크림\n설명: 데일리 보습 화장품',
    },
  )

  assert.deepEqual(result.keywords, ['촉촉한 보습감', '부드러운 발림성'])
  assert.deepEqual(result.removed, ['펌프 용기 편함', '패키지 깔끔'])
})

test('filterCosmeticContainerKeywords leaves unrelated product keywords alone', () => {
  const result = filterCosmeticContainerKeywords(
    ['포장 깔끔', '배송 빠름', '마감 탄탄'],
    {
      category: 'product',
      productContext: '상품명: 무선 키보드\n설명: 조용한 타건감',
    },
  )

  assert.deepEqual(result.keywords, ['포장 깔끔', '배송 빠름', '마감 탄탄'])
  assert.deepEqual(result.removed, [])
})

test('isSameKeywordSet matches keyword sets regardless of order and spacing', () => {
  assert.equal(
    isSameKeywordSet(['배송 빠름', '색감 좋음'], [' 색감  좋음 ', '배송 빠름']),
    true,
  )
  assert.equal(
    isSameKeywordSet(['배송 빠름', '색감 좋음'], ['마감 깔끔', '색감 좋음']),
    false,
  )
})

test('appendKeywordRetryGuidance includes rejected keyword sets', () => {
  const prompt = appendKeywordRetryGuidance('기본 프롬프트', [
    ['배송 빠름', '색감 좋음'],
    ['마감 깔끔', '포장 꼼꼼'],
  ])

  assert.match(prompt, /금지된 이전 키워드 조합/)
  assert.match(prompt, /배송 빠름, 색감 좋음/)
  assert.match(prompt, /마감 깔끔, 포장 꼼꼼/)
  assert.match(prompt, /같은 조합을 다시 내지 마/)
})

test('parseKeywordsFromText reads JSON keyword responses', () => {
  assert.deepEqual(
    parseKeywordsFromText('{"keywords":["배송 빠름","색감 좋음","마감 깔끔"]}'),
    ['배송 빠름', '색감 좋음', '마감 깔끔'],
  )
})

test('parseKeywordsFromText recovers keywords from quoted text', () => {
  assert.deepEqual(
    parseKeywordsFromText('키워드는 "배송 빠름", "색감 좋음", "마감 깔끔" 입니다.'),
    ['배송 빠름', '색감 좋음', '마감 깔끔'],
  )
})

/* global process */
import assert from 'node:assert/strict'
import test, { beforeEach } from 'node:test'
import handler from '../api/gemini.js'
import { clearProductAnalysisCache } from './product/fetchProductAnalysis.js'
import {
  createMockRequest,
  createMockResponse,
  geminiKeywordResponse,
  htmlResponse,
  jsonResponse,
  png1x1Base64,
  withTestEnv,
  withFetch,
  withFetchCalls,
} from './testUtils.js'

delete process.env.UPSTASH_REDIS_REST_URL
delete process.env.UPSTASH_REDIS_REST_TOKEN

// 테스트마다 다른 가짜 fetch를 쓰므로 이전 테스트의 상품 분석 캐시를 비웁니다.
beforeEach(clearProductAnalysisCache)

test('handler treats missing previousKeywords as an empty list', async () => {
  await withTestEnv(() =>
    withFetch(
      async () => geminiKeywordResponse(['포장 깔끔', '배송 빠름', '색감 좋음']),
      async () => {
        const req = createMockRequest({
          action: 'keywords',
          images: [{ imageBase64: png1x1Base64, mimeType: 'image/png' }],
          rating: 5,
          category: 'product',
        })
        const res = createMockResponse()

        await handler(req, res)

        assert.equal(res.statusCode, 200)
        assert.deepEqual(JSON.parse(res.body).keywords, ['포장 깔끔', '배송 빠름', '색감 좋음'])
      },
    ),
  )
})

test('handler maps upstream Gemini 500 during keyword generation to a client-safe error', async () => {
  await withTestEnv(() =>
    withFetch(
      async () =>
        jsonResponse(
          { error: { message: 'internal server error' } },
          500,
        ),
      async () => {
        const req = createMockRequest({
          action: 'keywords',
          images: [{ imageBase64: png1x1Base64, mimeType: 'image/png' }],
          rating: 5,
          category: 'product',
        })
        const res = createMockResponse()

        await handler(req, res)

        const body = JSON.parse(res.body)
        assert.equal(res.statusCode, 502)
        assert.equal(body.ok, false)
        assert.match(body.error, /Gemini API/)
      },
    ),
  )
})

test('handler refunds the daily review count when Gemini fails before streaming', async () => {
  await withTestEnv(() =>
    withFetch(
      async () => jsonResponse({ error: { message: 'bad request' } }, 400),
      async () => {
        const remaining = []
        for (let i = 0; i < 2; i += 1) {
          const res = createMockResponse()
          await handler(createMockRequest({ action: 'review', rating: 5, keywords: ['조용한 타건감'] }), res)
          assert.equal(res.statusCode, 502)
          remaining.push(res.headers['x-review-remaining'])
        }
        assert.ok(remaining[0])
        assert.equal(remaining[0], remaining[1])
      },
    ),
  )
})

test('handler does not fetch product pages for keyword requests', async () => {
  await withTestEnv(() =>
    withFetchCalls(
      async () => geminiKeywordResponse(['조용한 타건감', '낮은 디자인', '가벼운 무게']),
      async (calls) => {
        const req = createMockRequest({
          action: 'keywords',
          productUrl: 'https://shop.example/product/keyboard',
          rating: 5,
          category: 'product',
        })
        const res = createMockResponse()

        await handler(req, res)

        assert.equal(res.statusCode, 400)
        assert.equal(calls.length, 0)
      },
    ),
  )
})

test('handler analyzes product options from productUrl', async () => {
  await withTestEnv(() =>
    withFetch(
      async (url) => {
        if (String(url).startsWith('https://shop.example/product')) {
          return htmlResponse(
            '<html><head><title>테스트 상품</title></head><body><label for="color">색상</label><select id="color" name="color"><option value="">선택</option><option value="black">블랙</option><option value="white">화이트</option></select></body></html>',
          )
        }
        return jsonResponse({})
      },
      async () => {
        const req = createMockRequest({
          action: 'analyze-product',
          productUrl: 'https://shop.example/product/keyboard',
        })
        const res = createMockResponse()

        await handler(req, res)

        assert.equal(res.statusCode, 200)
        const body = JSON.parse(res.body)
        assert.equal(body.ok, true)
        assert.equal(body.optionGroups.length, 1)
        assert.equal(body.optionGroups[0].label, '색상')
        assert.deepEqual(
          body.optionGroups[0].options.map((option) => option.label),
          ['블랙', '화이트'],
        )
      },
    ),
  )
})

test('handler analyzes metadata when meta attributes are not in a fixed order', async () => {
  await withTestEnv(() =>
    withFetch(
      async (url) => {
        if (String(url).startsWith('https://shop.example/product')) {
          return htmlResponse(
            '<html><head><meta content="속성 순서가 다른 상품명" property="og:title"><meta content="순서와 관계없이 읽어야 하는 설명" name="description"></head></html>',
          )
        }
        return jsonResponse({})
      },
      async () => {
        const req = createMockRequest({
          action: 'analyze-product',
          productUrl: 'https://shop.example/product/order',
        })
        const res = createMockResponse()

        await handler(req, res)

        assert.equal(res.statusCode, 200)
        const body = JSON.parse(res.body)
        assert.match(body.productContext, /속성 순서가 다른 상품명/)
        assert.match(body.productContext, /순서와 관계없이 읽어야 하는 설명/)
      },
    ),
  )
})

test('handler analyzes product JSON-LD metadata when page meta tags are missing', async () => {
  await withTestEnv(() =>
    withFetch(
      async (url) => {
        if (String(url).startsWith('https://shop.example/product')) {
          return htmlResponse(
            [
              '<html><head><script type="application/ld+json">',
              JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'Product',
                name: 'JSON-LD 무선 마우스',
                description: '저소음 클릭과 긴 배터리 수명',
                brand: { '@type': 'Brand', name: 'Test Brand' },
                offers: { '@type': 'Offer', price: '39000', priceCurrency: 'KRW' },
              }),
              '</script></head></html>',
            ].join(''),
          )
        }
        return jsonResponse({})
      },
      async () => {
        const req = createMockRequest({
          action: 'analyze-product',
          productUrl: 'https://shop.example/product/json-ld',
        })
        const res = createMockResponse()

        await handler(req, res)

        assert.equal(res.statusCode, 200)
        const body = JSON.parse(res.body)
        assert.match(body.productContext, /JSON-LD 무선 마우스/)
        assert.match(body.productContext, /저소음 클릭과 긴 배터리 수명/)
        assert.match(body.productContext, /Test Brand/)
        assert.match(body.productContext, /39000 KRW/)
      },
    ),
  )
})

test('handler analyzes product data embedded for client-side rendering', async () => {
  await withTestEnv(() =>
    withFetch(
      async (url) => {
        if (String(url).startsWith('https://shop.example/product')) {
          return htmlResponse(
            [
              '<html><head><title>Loading...</title></head><body>',
              '<div id="root"></div>',
              '<script>',
              'window.__INITIAL_STATE__ = ',
              JSON.stringify({
                page: {
                  goods: {
                    goodsNm: '로딩 후 표시되는 세럼',
                    brandNm: '동적 브랜드',
                    goodsImgUrl: '/images/serum.jpg',
                    salePrc: 21900,
                    goodsDesc: '수분감이 오래가는 상품',
                  },
                },
              }),
              '</script>',
              '</body></html>',
            ].join(''),
          )
        }
        return jsonResponse({})
      },
      async () => {
        const req = createMockRequest({
          action: 'analyze-product',
          productUrl: 'https://shop.example/product/detail?goodsNo=A0001',
        })
        const res = createMockResponse()

        await handler(req, res)

        assert.equal(res.statusCode, 200)
        const body = JSON.parse(res.body)
        assert.equal(body.product.name, '로딩 후 표시되는 세럼')
        assert.equal(body.product.brand, '동적 브랜드')
        assert.equal(body.product.price, '21900')
        assert.equal(body.product.imageUrl, 'https://shop.example/images/serum.jpg')
        assert.match(body.productContext, /로딩 후 표시되는 세럼/)
        assert.match(body.productContext, /동적 브랜드/)
      },
    ),
  )
})

test('handler generates keywords from productContext without images', async () => {
  await withTestEnv(() =>
    withFetch(
      async () => geminiKeywordResponse(['블랙 컬러', '무선 연결', '가벼운 무게']),
      async () => {
        const req = createMockRequest({
          action: 'keywords',
          productUrl: 'https://shop.example/product/keyboard',
          productContext: '사이트: shop.example\n상품명: 테스트 키보드\n선택 옵션:\n색상: 블랙',
          rating: 5,
          category: 'product',
          previousKeywords: [],
        })
        const res = createMockResponse()

        await handler(req, res)

        assert.equal(res.statusCode, 200)
        assert.deepEqual(JSON.parse(res.body).keywords, ['블랙 컬러', '무선 연결', '가벼운 무게'])
      },
    ),
  )
})

test('handler retries keyword generation and reports the last failure reason', async () => {
  const cases = [
    {
      // 화장품 맥락에서 용기 중심 키워드만 나오면 걸러 내고 다시 묻습니다.
      keywords: ['용기 디자인 예쁨', '펌프 구조 독특함', '케이스 색상 고급'],
      body: { productContext: '상품명: 수분 크림' },
      error: /용기나 패키지/,
    },
    {
      keywords: ['조용한 타건감', '낮은 디자인', '가벼운 무게'],
      body: {
        productContext: '상품명: 무선 키보드',
        previousKeywords: ['조용한 타건감', '낮은 디자인', '가벼운 무게'],
      },
      error: /같은 키워드만/,
    },
  ]
  for (const { keywords, body, error } of cases) {
    await withTestEnv(() =>
      withFetchCalls(
        async () => geminiKeywordResponse(keywords),
        async (calls) => {
          const res = createMockResponse()
          await handler(
            createMockRequest({ action: 'keywords', rating: 5, category: 'product', ...body }),
            res,
          )
          assert.equal(res.statusCode, 502)
          assert.match(JSON.parse(res.body).error, error)
          assert.equal(calls.length, 3)
        },
      ),
    )
  }
})

test('handler refunds the daily review count when the stream ends truncated', async () => {
  const sse = `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: '잘린 리뷰' }] }, finishReason: 'MAX_TOKENS' }] })}\n\n`
  await withTestEnv(() =>
    withFetch(
      async () => new Response(sse, { status: 200 }),
      async () => {
        const lines = []
        for (let i = 0; i < 2; i += 1) {
          const res = createMockResponse()
          await handler(createMockRequest({ action: 'review', rating: 4, keywords: ['배터리 오래감'] }), res)
          lines.push(JSON.parse(res.body.trim().split('\n').at(-1)))
        }
        assert.match(lines[0].error, /잘렸습니다/)
        assert.ok(Number.isFinite(lines[0].remaining))
        assert.equal(lines[0].remaining, lines[1].remaining)
      },
    ),
  )
})

const reviewText = '손에 쥐기 편하고 무게감도 적당해서 사용하는 동안 손목에 부담이 덜했어요.'
const reviewTextChunk = `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: reviewText }] } }] })}\n\n`
const reviewFinishChunk = (finishReason) => `data: ${JSON.stringify({ candidates: [{ finishReason }] })}\n\n`
const reviewRequest = () => createMockRequest({ action: 'review', length: 'short', rating: 4, keywords: ['편한 사용감'] })
const reviewLines = (res) => res.body.trim().split('\n').map((line) => JSON.parse(line))

test('handler completes a review after receiving a separate STOP chunk', async () => {
  await withTestEnv(() => withFetch(
    async () => new Response(reviewTextChunk + reviewFinishChunk('STOP')),
    async () => {
      const res = createMockResponse()
      await handler(reviewRequest(), res)
      assert.deepEqual(reviewLines(res), [{ text: reviewText }, { done: true, finishReason: 'STOP' }])
    },
  ))
})

for (const finishReason of [null, 'SAFETY']) {
  test(`handler refunds a long enough review when the upstream finish reason is ${finishReason ?? 'missing'}`, async () => {
    const ending = finishReason ? reviewFinishChunk(finishReason) : ''
    await withTestEnv(() => withFetch(
      async () => new Response(reviewTextChunk + ending),
      async () => {
        const res = createMockResponse()
        await handler(reviewRequest(), res)
        const [text, error] = reviewLines(res)
        assert.deepEqual(text, { text: reviewText })
        assert.match(error.error, /정상적으로 끝나지 않았습니다/)
        assert.equal(error.remaining, Number(res.headers['x-review-remaining']) + 1)
        assert.equal(error.done, undefined)
      },
    ))
  })
}

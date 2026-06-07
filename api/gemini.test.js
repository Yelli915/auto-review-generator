/* global process */
import assert from 'node:assert/strict'
import test from 'node:test'
import handler from './gemini.js'
import {
  createMockRequest,
  createMockResponse,
  geminiKeywordResponse,
  htmlResponse,
  jsonResponse,
  png1x1Base64,
  withEnv,
  withFetch,
  withFetchCalls,
} from './testUtils.js'

delete process.env.UPSTASH_REDIS_REST_URL
delete process.env.UPSTASH_REDIS_REST_TOKEN

test('handler ping works without auth or Gemini environment variables', async () => {
  await withEnv(
    {
      GEMINI_API_KEY: null,
      GOOGLE_CLIENT_ID: null,
      ALLOWED_ORIGINS: null,
    },
    async () => {
      const req = createMockRequest({ action: 'ping' })
      const res = createMockResponse()

      await handler(req, res)

      assert.equal(res.statusCode, 200)
      assert.equal(JSON.parse(res.body).ok, true)
    },
  )
})

test('handler treats missing previousKeywords as an empty list', async () => {
  await withEnv(
    {
      GEMINI_API_KEY: 'test-key',
      GOOGLE_CLIENT_ID: null,
      API_AUTH_TOKEN: null,
    },
    () =>
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
  await withEnv(
    {
      GEMINI_API_KEY: 'test-key',
      GOOGLE_CLIENT_ID: null,
      API_AUTH_TOKEN: null,
    },
    () =>
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

test('handler generates keywords from productUrl metadata', async () => {
  await withEnv(
    {
      GEMINI_API_KEY: 'test-key',
      GOOGLE_CLIENT_ID: null,
      API_AUTH_TOKEN: null,
    },
    () =>
      withFetchCalls(
        async (url) => {
          if (String(url).startsWith('https://shop.example/product')) {
            return htmlResponse(
              '<html><head><title>가벼운 무선 키보드</title><meta name="description" content="조용한 타건감과 낮은 높이의 디자인"></head></html>',
            )
          }
          return geminiKeywordResponse(['조용한 타건감', '낮은 디자인', '가벼운 무게'])
        },
        async (calls) => {
          const req = createMockRequest({
            action: 'keywords',
            productUrl: 'https://shop.example/product/keyboard',
            rating: 5,
            category: 'product',
          })
          const res = createMockResponse()

          await handler(req, res)

          assert.equal(res.statusCode, 200)
          assert.deepEqual(JSON.parse(res.body).keywords, [
            '조용한 타건감',
            '낮은 디자인',
            '가벼운 무게',
          ])
          assert.equal(calls.length, 2)
        },
      ),
  )
})

test('handler analyzes product options from productUrl', async () => {
  await withEnv({ API_AUTH_TOKEN: null }, () =>
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
  await withEnv({ API_AUTH_TOKEN: null }, () =>
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
  await withEnv({ API_AUTH_TOKEN: null }, () =>
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
  await withEnv({ API_AUTH_TOKEN: null }, () =>
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
  await withEnv(
    {
      GEMINI_API_KEY: 'test-key',
      GOOGLE_CLIENT_ID: null,
      API_AUTH_TOKEN: null,
    },
    () =>
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

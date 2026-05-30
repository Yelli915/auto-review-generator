/* global process */
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'
import test from 'node:test'
import handler, {
  applyDailyUsageLimit,
  applyRateLimit,
  appendKeywordRetryGuidance,
  buildImageParts,
  buildKeywordGenerationConfig,
  buildReviewGenerationConfig,
  humanizeGeminiApiError,
  isSameKeywordSet,
  parseKeywordsFromText,
  sanitizeKeywordArray,
  validateImageInput,
  validateImagesInput,
} from './gemini.js'
import { normalizeReviewCategory } from '../shared/reviewCategories.js'

const png1x1Base64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='

delete process.env.UPSTASH_REDIS_REST_URL
delete process.env.UPSTASH_REDIS_REST_TOKEN

function createMockRequest(body, headers = {}) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))])
  req.method = 'POST'
  req.headers = headers
  req.socket = { remoteAddress: '127.0.0.1' }
  return req
}

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value
    },
    end(chunk = '') {
      this.body += chunk
    },
    write(chunk = '') {
      this.body += chunk
    },
  }
}

function withEnv(updates, fn) {
  const previous = {}
  for (const key of Object.keys(updates)) {
    previous[key] = process.env[key]
    const value = updates[key]
    if (value == null) delete process.env[key]
    else process.env[key] = value
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value == null) delete process.env[key]
        else process.env[key] = value
      }
    })
}

async function withFetch(mockFetch, fn) {
  const oldFetch = globalThis.fetch
  globalThis.fetch = mockFetch
  try {
    return await fn()
  } finally {
    globalThis.fetch = oldFetch
  }
}

async function withFetchCalls(mockFetch, fn) {
  const calls = []
  return withFetch(
    async (...args) => {
      calls.push(String(args[0]))
      return mockFetch(...args)
    },
    () => fn(calls),
  )
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function geminiKeywordResponse(keywords) {
  return jsonResponse({
    candidates: [
      {
        content: {
          parts: [{ text: JSON.stringify({ keywords }) }],
        },
      },
    ],
  })
}

test('validateImageInput accepts supported image content', () => {
  const result = validateImageInput(`\n${png1x1Base64}\n`, 'IMAGE/PNG')

  assert.equal(result.ok, true)
  assert.equal(result.mimeType, 'image/png')
  assert.equal(result.imageBase64, png1x1Base64)
})

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

test('fetchProductAnalysis falls back when product page returns non-ok response', async () => {
  await withEnv({ DISABLE_RENDERED_PRODUCT_FETCH: '1' }, () =>
    withFetch(
      async () => new Response('blocked', { status: 403 }),
      async () => {
        const { fetchProductAnalysis } = await import('./productContext.js')
        const result = await fetchProductAnalysis(
          'https://shop.example/products/noise-canceling-headphones',
        )

        assert.equal(result.ok, true)
        assert.match(result.productContext, /shop\.example/)
        assert.match(result.productContext, /noise canceling headphones/)
        assert.match(result.productContext, /HTTP 403/)
      },
    ),
  )
})

test('fetchProductAnalysis uses reader fallback when direct product page is blocked', async () => {
  const calls = []
  await withFetch(
    async (url) => {
      calls.push(String(url))
      if (String(url).startsWith('https://r.jina.ai/')) {
        return new Response(
          [
            'Title: Noise Canceling Headphones - Black',
            'URL Source: https://shop.example/products/noise-canceling-headphones',
            'Markdown Content:',
            'Wireless headphones with active noise canceling and long battery life.',
          ].join('\n'),
          { headers: { 'content-type': 'text/plain' } },
        )
      }
      return new Response('blocked', { status: 403 })
    },
    async () => {
      const { fetchProductAnalysis } = await import('./productContext.js')
      const result = await fetchProductAnalysis(
        'https://shop.example/products/noise-canceling-headphones',
      )

      assert.equal(result.ok, true)
      assert.equal(result.optionGroups.length, 0)
      assert.match(result.productContext, /Noise Canceling Headphones - Black/)
      assert.match(result.productContext, /Wireless headphones/)
      assert.match(result.productContext, /HTTP 403/)
      assert.equal(calls.length, 2)
      assert.equal(
        calls[1],
        'https://r.jina.ai/https://shop.example/products/noise-canceling-headphones',
      )
    },
  )
})

test('fetchProductAnalysis ignores access challenge pages as product content', async () => {
  const challengeHtml = [
    '<html><head><title>Just a moment...</title></head>',
    '<body>',
    '<h1>Just a moment...</h1>',
    '<p>Verification successful. Waiting for www.oliveyoung.co.kr to respond</p>',
    '<p>RAY_ID a03b1a941a3ce44c</p>',
    '</body></html>',
  ].join('')

  await withEnv({ DISABLE_RENDERED_PRODUCT_FETCH: '1' }, () =>
    withFetch(
      async (url) => {
        if (String(url).startsWith('https://r.jina.ai/')) {
          return new Response('Title: Just a moment...\nHTTP 403 Forbidden', {
            headers: { 'content-type': 'text/plain' },
          })
        }
        return htmlResponse(challengeHtml)
      },
      async () => {
        const { fetchProductAnalysis } = await import('./productContext.js')
        const result = await fetchProductAnalysis(
          'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000223414',
        )

        assert.equal(result.ok, true)
        assert.equal(result.analysisStatus, 'fallback')
        assert.equal(result.needsManualInput, true)
        assert.notEqual(result.product.name, 'Just a moment...')
        assert.match(result.productContext, /Access challenge page/)
      },
    ),
  )
})

test('validateImageInput rejects unsupported mime types', () => {
  const result = validateImageInput(png1x1Base64, 'image/gif')

  assert.equal(result.ok, false)
  assert.equal(result.status, 415)
})

test('validateImageInput rejects malformed base64', () => {
  const result = validateImageInput('not-valid-base64!', 'image/png')

  assert.equal(result.ok, false)
  assert.equal(result.status, 400)
})

test('validateImageInput rejects mismatched mime and file signature', () => {
  const result = validateImageInput(png1x1Base64, 'image/jpeg')

  assert.equal(result.ok, false)
  assert.equal(result.status, 400)
})

test('validateImageInput rejects decoded images above the server limit', () => {
  const oversizedPng = Buffer.alloc(1536 * 1024 + 1)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(
    oversizedPng,
  )

  const result = validateImageInput(oversizedPng.toString('base64'), 'image/png')

  assert.equal(result.ok, false)
  assert.equal(result.status, 413)
})

test('validateImagesInput accepts one to three images', () => {
  const result = validateImagesInput([
    { imageBase64: png1x1Base64, mimeType: 'image/png' },
    { imageBase64: png1x1Base64, mimeType: 'image/png' },
    { imageBase64: png1x1Base64, mimeType: 'image/png' },
  ])

  assert.equal(result.ok, true)
  assert.equal(result.images.length, 3)
  assert.equal(result.images[0].mimeType, 'image/png')
})

test('validateImagesInput rejects empty and too many image arrays', () => {
  assert.equal(validateImagesInput([]).ok, false)

  const tooMany = validateImagesInput([
    { imageBase64: png1x1Base64, mimeType: 'image/png' },
    { imageBase64: png1x1Base64, mimeType: 'image/png' },
    { imageBase64: png1x1Base64, mimeType: 'image/png' },
    { imageBase64: png1x1Base64, mimeType: 'image/png' },
  ])
  assert.equal(tooMany.ok, false)
  assert.equal(tooMany.status, 400)
})

test('validateImagesInput keeps legacy single-image request compatibility', () => {
  const result = validateImagesInput(undefined, png1x1Base64, 'image/png')

  assert.equal(result.ok, true)
  assert.equal(result.images.length, 1)
})

test('buildImageParts maps validated images to Gemini inline data parts', () => {
  assert.deepEqual(
    buildImageParts([
      { imageBase64: 'abc', mimeType: 'image/jpeg' },
      { imageBase64: 'def', mimeType: 'image/png' },
    ]),
    [
      { inline_data: { mime_type: 'image/jpeg', data: 'abc' } },
      { inline_data: { mime_type: 'image/png', data: 'def' } },
    ],
  )
})

test('applyRateLimit blocks bursts after the request window limit', async () => {
  const id = `test-rate-${Date.now()}-${Math.random()}`

  for (let i = 0; i < 20; i += 1) {
    assert.equal((await applyRateLimit(id)).ok, true)
  }

  const blocked = await applyRateLimit(id)
  assert.equal(blocked.ok, false)
  assert.equal(Number.isInteger(blocked.retryAfterSec), true)
})

test('applyDailyUsageLimit allows only counted actions up to the daily limit', async () => {
  const id = `test-user-${Date.now()}-${Math.random()}`

  assert.equal((await applyDailyUsageLimit(id, 'ping')).ok, true)

  for (let i = 0; i < 20; i += 1) {
    assert.equal((await applyDailyUsageLimit(id, 'keywords')).ok, true)
  }

  const blocked = await applyDailyUsageLimit(id, 'review')
  assert.equal(blocked.ok, false)
  assert.equal(blocked.limit, 20)
  assert.equal(Number.isInteger(blocked.retryAfterSec), true)
})

test('sanitizeKeywordArray keeps short Hangul phrases and removes invalid values', () => {
  assert.deepEqual(
    sanitizeKeywordArray([
      '배송 빠름',
      '배송 빠름',
      '색감 좋음',
      'too long english only',
      '추천해요',
      '',
    ]),
    ['배송 빠름', '색감 좋음'],
  )
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

test('buildKeywordGenerationConfig reserves output for short JSON responses', () => {
  const config = buildKeywordGenerationConfig()

  assert.equal(config.responseMimeType, 'application/json')
  assert.equal(config.responseSchema.type, 'object')
  assert.equal(config.responseJsonSchema, undefined)
  assert.equal(config.thinkingConfig.thinkingBudget, 0)
  assert.ok(config.maxOutputTokens >= 1024)
})

test('buildReviewGenerationConfig prioritizes complete reviews over tight length caps', () => {
  const shortConfig = buildReviewGenerationConfig('short')
  const mediumConfig = buildReviewGenerationConfig('medium')
  const longConfig = buildReviewGenerationConfig('long')

  assert.equal(shortConfig.temperature, 0.6)
  assert.equal(shortConfig.thinkingConfig.thinkingBudget, 0)
  assert.ok(shortConfig.maxOutputTokens >= 1024)
  assert.ok(mediumConfig.maxOutputTokens > shortConfig.maxOutputTokens)
  assert.ok(longConfig.maxOutputTokens > mediumConfig.maxOutputTokens)
})

test('humanizeGeminiApiError preserves non-quota API messages', () => {
  assert.equal(humanizeGeminiApiError(400, 'bad request'), 'bad request')
})

test('humanizeGeminiApiError returns rate-limit guidance for quota errors', () => {
  const message = humanizeGeminiApiError(429, 'quota exceeded, retry in 3.2s')

  assert.match(message, /Gemini API/)
  assert.match(message, /ai\.google\.dev/)
})

test('humanizeGeminiApiError returns retry guidance for transient upstream failures', () => {
  const message = humanizeGeminiApiError(500, 'internal server error')

  assert.match(message, /Gemini API/)
  assert.doesNotMatch(message, /HTTP 500/)
})

test('normalizeReviewCategory accepts known categories and falls back safely', () => {
  assert.equal(normalizeReviewCategory('place'), 'place')
  assert.equal(normalizeReviewCategory('product'), 'product')
  assert.equal(normalizeReviewCategory('unknown'), 'place')
  assert.equal(normalizeReviewCategory(undefined), 'place')
})

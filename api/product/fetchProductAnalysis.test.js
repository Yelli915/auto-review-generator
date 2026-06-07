import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchProductAnalysis } from '../productContext.js'
import {
  htmlResponse,
  withEnv,
  withFetch,
} from '../testUtils.js'

test('fetchProductAnalysis falls back when product page returns non-ok response', async () => {
  await withEnv({ DISABLE_RENDERED_PRODUCT_FETCH: '1' }, () =>
    withFetch(
      async () => new Response('blocked', { status: 403 }),
      async () => {
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

test('fetchProductAnalysis does not follow reader redirects to private-network URLs', async () => {
  const calls = []
  await withEnv({ DISABLE_RENDERED_PRODUCT_FETCH: '1' }, () =>
    withFetch(
      async (url) => {
        calls.push(String(url))
        if (String(url).startsWith('https://r.jina.ai/')) {
          return new Response('', {
            status: 302,
            headers: { location: 'http://10.0.0.5/metadata' },
          })
        }
        return new Response('blocked', { status: 403 })
      },
      async () => {
        const result = await fetchProductAnalysis(
          'https://shop.example/products/noise-canceling-headphones',
        )

        assert.equal(result.ok, true)
        assert.equal(result.analysisStatus, 'fallback')
        assert.equal(calls.length, 2)
        assert.equal(
          calls[1],
          'https://r.jina.ai/https://shop.example/products/noise-canceling-headphones',
        )
      },
    ),
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

test('fetchProductAnalysis rejects private-network product URLs before fetching', async () => {
  let fetchCalled = false

  await withFetch(
    async () => {
      fetchCalled = true
      return htmlResponse('<html></html>')
    },
    async () => {
      const result = await fetchProductAnalysis('http://10.0.0.5/products/1')

      assert.equal(result.ok, false)
      assert.equal(result.status, 400)
      assert.equal(fetchCalled, false)
    },
  )
})

test('fetchProductAnalysis follows only validated public redirects', async () => {
  const calls = []

  await withFetch(
    async (url) => {
      calls.push(String(url))
      if (String(url) === 'https://shop.example/products/redirect') {
        return new Response('', {
          status: 302,
          headers: { location: '/products/final' },
        })
      }
      return htmlResponse(
        [
          '<html><head>',
          '<meta property="og:title" content="Redirected Product">',
          '<meta property="og:description" content="Public final page">',
          '</head><body></body></html>',
        ].join(''),
      )
    },
    async () => {
      const result = await fetchProductAnalysis(
        'https://shop.example/products/redirect',
      )

      assert.equal(result.ok, true)
      assert.equal(result.url, 'https://shop.example/products/final')
      assert.equal(calls.length, 2)
      assert.deepEqual(calls, [
        'https://shop.example/products/redirect',
        'https://shop.example/products/final',
      ])
    },
  )
})

test('fetchProductAnalysis rejects redirects to private-network URLs', async () => {
  const calls = []

  await withFetch(
    async (url) => {
      calls.push(String(url))
      return new Response('', {
        status: 302,
        headers: { location: 'http://10.0.0.5/products/1' },
      })
    },
    async () => {
      const result = await fetchProductAnalysis(
        'https://shop.example/products/redirect-private',
      )

      assert.equal(result.ok, false)
      assert.equal(result.status, 400)
      assert.equal(calls.length, 1)
    },
  )
})

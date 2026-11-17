import assert from 'node:assert/strict'
import http from 'node:http'
import test, { beforeEach } from 'node:test'
import {
  clearProductAnalysisCache,
  prepareProductAnalysis,
  readProductAnalysis,
} from './fetchProductAnalysis.js'
import {
  htmlResponse,
  withFetch,
} from '../testUtils.js'
import { PUBLIC_ONLY_DISPATCHER } from './publicFetch.js'
import {
  extractProductInfoFromHtml,
  extractProductOptionGroupsFromHtml,
} from './htmlProduct.js'

// 테스트마다 다른 가짜 fetch를 쓰므로 이전 테스트의 상품 분석 캐시를 비웁니다.
beforeEach(clearProductAnalysisCache)

// 핸들러와 같은 순서(검증 → 캐시 → 읽기)로 상품을 분석합니다.
async function fetchProductAnalysis(rawUrl) {
  const prepared = await prepareProductAnalysis(rawUrl)
  if (!prepared.ok) return prepared
  return prepared.cached ?? readProductAnalysis(prepared.url)
}

test('fetchProductAnalysis falls back when product page returns non-ok response', async () => {
  await withFetch(
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
  await withFetch(
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

  await withFetch(
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

test('fetchProductAnalysis caches redirected results under the requested URL', async () => {
  let fetchCount = 0
  await withFetch(
    async (url) => {
      fetchCount += 1
      if (String(url) === 'https://shop.example/short') {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://shop.example/products/keyboard' },
        })
      }
      return htmlResponse(
        '<html><head><meta property="og:title" content="키보드"></head></html>',
      )
    },
    async () => {
      const first = await fetchProductAnalysis('https://shop.example/short')
      const second = await fetchProductAnalysis('https://shop.example/short')
      assert.equal(first.ok, true)
      assert.equal(second, first)
      assert.equal(fetchCount, 2)
    },
  )
})

test('prepareProductAnalysis returns cached results so callers can skip charging', async () => {
  await withFetch(
    async () =>
      htmlResponse('<html><head><meta property="og:title" content="마우스"></head></html>'),
    async () => {
      const url = 'https://shop.example/products/mouse'
      assert.equal((await prepareProductAnalysis(url)).cached, null)
      await fetchProductAnalysis(url)
      assert.equal((await prepareProductAnalysis(url)).cached?.product.name, '마우스')
    },
  )
})

// 리다이렉트 대상은 DNS를 미리 조회하지 않고 연결 시점에만 검사하므로, 실제 fetch가 dispatcher를 따르는지 확인합니다.
test('PUBLIC_ONLY_DISPATCHER refuses to connect to hosts resolving to internal addresses', async () => {
  const server = http.createServer((_, res) => res.end('internal')).listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    await assert.rejects(
      fetch(`http://localhost:${server.address().port}/`, { dispatcher: PUBLIC_ONLY_DISPATCHER }),
      (err) => err.cause?.code === 'EBLOCKEDADDR',
    )
  } finally {
    server.close()
  }
})

test('extractProductOptionGroupsFromHtml reads radio labels from <label for>', () => {
  const html =
    '<label for="s">작은 사이즈</label><input type="radio" name="size" id="s" value="S">' +
    '<input type="radio" name="size" id="m" value="M"><label for="m">중간 사이즈</label>'
  const [group] = extractProductOptionGroupsFromHtml(html)
  assert.deepEqual(
    group.options.map((option) => option.label),
    ['작은 사이즈', '중간 사이즈'],
  )
})

test('extractProductInfoFromHtml keeps JSON-LD strings that contain entity text', () => {
  const html =
    '<script type="application/ld+json">' +
    '{"@type":"Product","name":"A &quot;B&quot; 크림","description":"첫 줄\\n둘째 줄"}' +
    '</script>'
  const product = extractProductInfoFromHtml(html, 'https://shop.example.com/p/1')
  assert.equal(product.name, 'A "B" 크림')
})

test('extractProductInfoFromHtml decodes entities inside JSON-LD string values', () => {
  const html =
    '<script type="application/ld+json">' +
    '{"@type":"Product","name":"Johnson &amp; Johnson 로션","brand":{"name":"J&amp;J"}}' +
    '</script>'
  const product = extractProductInfoFromHtml(html, 'https://shop.example.com/p/1')
  assert.equal(product.name, 'Johnson & Johnson 로션')
  assert.equal(product.brand, 'J&J')
})

test('extractProductOptionGroupsFromHtml drops duplicate options', () => {
  const html =
    '<select name="color"><option value="r">빨강</option><option value="r">빨강</option>' +
    '<option value="b">파랑</option></select>'
  const [group] = extractProductOptionGroupsFromHtml(html)
  assert.deepEqual(group.options.map((option) => option.value), ['r', 'b'])
})

test('fetchProductAnalysis falls back to the reader and always asks for confirmation', async () => {
  await withFetch(
    async (url) =>
      String(url).startsWith('https://r.jina.ai/')
        ? new Response('Title: 수분 크림 50ml\n\n촉촉한 제형의 데일리 크림')
        : htmlResponse('blocked', 403),
    async () => {
      const result = await fetchProductAnalysis('https://shop.example/product/cream')

      assert.equal(result.analysisStatus, 'reader')
      assert.equal(result.needsManualInput, true)
      assert.equal(result.product.name, '수분 크림 50ml')
      assert.deepEqual(result.optionGroups, [])
    },
  )
})

test('extractProductInfoFromHtml keeps escaped quotes in embedded JSON and survives invalid entities', () => {
  const data = { props: { product: { name: '27&quot; 모니터 &#99999999;', brand: '루미', price: '199000' } } }
  const html = `<html><head><title>x</title><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></head></html>`

  const info = extractProductInfoFromHtml(html, 'https://shop.example.com/p/1')

  assert.equal(info.name, '27" 모니터 &#99999999;')
  assert.equal(info.brand, '루미')
})

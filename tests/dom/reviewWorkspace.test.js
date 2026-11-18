import assert from 'node:assert/strict'
import { after, afterEach, before, describe, test } from 'node:test'
import { createElement, createRef, StrictMode, useImperativeHandle, useState } from 'react'
import { createDomEnvironment } from '../helpers/domEnvironment.js'
import { createReviewDraft, DRAFT_KEY } from '../helpers/reviewFixtures.js'

describe('리뷰 작성 DOM 통합 검증', { concurrency: false, timeout: 30000 }, () => {
  let env, ReviewGenerator, Workspace, ResultPanel, useDraftPersistence, useReviewWorkspace
  before(async () => {
    env = await createDomEnvironment()
    ;({ default: ReviewGenerator, Workspace } = await env.loadModule('ReviewGenerator.jsx'))
    ;({ default: ResultPanel } = await env.loadModule('sections/ResultPanel.jsx'))
    ;({ useDraftPersistence } = await env.loadModule('hooks/useDraftPersistence.js'))
    ;({ useReviewWorkspace } = await env.loadModule('hooks/useReviewWorkspace.js'))
  })
  afterEach(async () => { await env?.reset() })
  after(async () => { await env?.close() })

  const readDraft = () => JSON.parse(env.window.sessionStorage.getItem(DRAFT_KEY))
  const saveFixture = (options) => {
    const draft = createReviewDraft(options)
    env.window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    return draft
  }
  const renderStrict = (component, props = {}) => env.render(createElement(StrictMode, null, createElement(component, props)))
  const findButton = (label) => [...env.document.querySelectorAll('button')]
    .find((button) => button.textContent.trim() === label)

  function WorkspaceHarness({ apiRef }) {
    const workspace = useReviewWorkspace({})
    useImperativeHandle(apiRef, () => workspace, [workspace])
    return null
  }

  test('StrictMode에서 완성된 상태만 저장하고 초기화 후 이전 초안을 다시 쓰지 않는다', async () => {
    function PersistenceHarness(props) { useDraftPersistence(props); return null }
    const state = { category: 'place', userExperience: '완성된 입력' }
    const versions = [{ n: 1, text: '완성된 리뷰' }]
    const props = { state, versions, activeVersion: 0, imageCount: 0, isGenerating: false }
    await renderStrict(PersistenceHarness, props)
    env.pagehide()
    assert.equal(readDraft().versions[0].text, '완성된 리뷰')

    await renderStrict(PersistenceHarness, { ...props, state: { ...state, userExperience: '수정한 입력' } })
    await renderStrict(PersistenceHarness, { ...props, versions: [{ n: 2, text: '미완성 조각' }], isGenerating: true })
    env.pagehide()
    assert.equal(readDraft().userExperience, '수정한 입력')
    assert.equal(readDraft().versions[0].text, '완성된 리뷰')

    await env.unmount()
    env.window.sessionStorage.clear()
    env.pagehide()
    assert.equal(env.window.sessionStorage.getItem(DRAFT_KEY), null)
  })

  test('다시 마운트하면 실제 저장소에서 입력·키워드·선택 버전을 복원한다', async () => {
    const saved = saveFixture()
    const api = createRef()
    await renderStrict(WorkspaceHarness, { apiRef: api })
    await env.act(() => {
      api.current.setUserExperience('새로 입력한 경험')
      api.current.setActiveVersion(0)
    })
    env.pagehide()
    await env.unmount()
    await renderStrict(WorkspaceHarness, { apiRef: api })
    assert.equal(api.current.userExperience, '새로 입력한 경험')
    assert.deepEqual(api.current.selectedKeywords, saved.selectedKeywords)
    assert.deepEqual(api.current.versions.map(({ text }) => text), saved.versions.map(({ text }) => text))
    assert.equal(api.current.activeVersion, 0)
    assert.equal(api.current.upload.images.length, 0)
    assert.equal(api.current.canGenerateReview, true)
  })

  function saveProductDraft(productUrl, name = '이전 상품') {
    const product = { name }
    env.window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
      ...createReviewDraft({ versionCount: 0 }),
      category: 'product', subcategory: '', inputMode: 'link', productUrl,
      product,
      productAnalysis: { url: productUrl, inputUrl: productUrl, product, analysisStatus: 'ok' },
      sourceData: { category: 'product', subcategory: '', productContext: `상품명: ${name}` },
    }))
  }

  test('링크를 바꾸면 기존 키워드는 유지하고 재분석 후에만 새 키워드를 추천받는다', async () => {
    const oldUrl = 'https://example.com/old'
    const newUrl = 'https://example.com/new'
    const requests = []
    saveProductDraft(oldUrl)
    env.mockFetch(async (_url, init) => {
      const body = JSON.parse(init.body)
      requests.push(body)
      if (body.action === 'analyze-product') {
        return Response.json({ ok: true, url: newUrl, analysisStatus: 'ok', product: { name: '새 상품' } })
      }
      return Response.json({ ok: true, keywords: ['가벼운 무게', '튼튼한 마감', '작은 크기'] })
    })

    await renderStrict(ReviewGenerator)
    const backToCompose = () => env.click(env.document.querySelector('[aria-label="리뷰 재료 수정하기"]'))
    await env.click(env.document.querySelector('.resume-card'))
    await backToCompose()
    await env.type(env.document.querySelector('input[type="url"]'), newUrl)
    await env.click(findButton('기존 키워드로 계속하기'))

    const refresh = findButton('다른 키워드 추천')
    assert.equal(refresh.disabled, true)
    assert.equal(findButton('넓은 좌석').getAttribute('aria-pressed'), 'true')
    assert.equal(findButton('리뷰 만들기').disabled, false)
    await env.click(refresh)
    assert.deepEqual(requests, [])
    assert.match(env.document.querySelector('.screen--keywords .notice').textContent, /입력이 바뀌었어요/)

    await backToCompose()
    await env.click(findButton('바뀐 링크로 다시 분석하기'))
    await env.click(findButton('키워드 다시 추천받기'))
    assert.deepEqual(requests.map(({ action }) => action), ['analyze-product', 'keywords'])
    assert.equal(requests[0].productUrl, newUrl)
    assert.match(requests[1].productContext, /상품명: 새 상품/)
    assert.doesNotMatch(requests[1].productContext, /이전 상품/)
    assert.equal(findButton('다른 키워드 추천').disabled, false)
  })

  test('키워드 생성 함수를 직접 호출해도 변경된 링크의 이전 상품 정보를 보내지 않는다', async () => {
    saveProductDraft('https://example.com/old')
    const api = createRef()
    const fetchRequests = []
    env.mockFetch(async (...request) => {
      fetchRequests.push(request)
      return Response.json({ ok: true, keywords: ['가벼운 무게', '튼튼한 마감', '작은 크기'] })
    })
    await renderStrict(WorkspaceHarness, { apiRef: api })
    await env.act(() => api.current.setProductUrl('https://example.com/new'))
    await env.act(async () => {
      assert.equal(await api.current.buildKeywords({ avoidPrevious: true }), false)
    })
    assert.deepEqual(fetchRequests, [])
    assert.equal(api.current.keywordsStale, true)
  })

  function mockImageConversion(context) {
    const imageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Image')
    const pending = []
    Object.defineProperty(globalThis, 'Image', {
      configurable: true,
      value: class {
        width = 1
        height = 1
        set src(_url) { pending.push(this) }
      },
    })
    context.after(() => {
      if (imageDescriptor) Object.defineProperty(globalThis, 'Image', imageDescriptor)
      else delete globalThis.Image
    })
    const canvas = env.window.HTMLCanvasElement.prototype
    context.mock.method(canvas, 'getContext', () => ({ drawImage() {} }))
    context.mock.method(canvas, 'toDataURL', () => 'data:image/jpeg;base64,YQ==')
    return {
      pending,
      async complete() {
        const image = pending.shift()
        assert.ok(image)
        await env.act(async () => image.onload())
      },
    }
  }

  const photo = (name) => new File(['photo'], name, { type: 'image/jpeg' })
  const selectPhotos = (input, ...files) => {
    Object.defineProperty(input, 'files', { configurable: true, value: files })
    return env.act(() => input.dispatchEvent(new env.window.Event('change', { bubbles: true })))
  }

  test('사진 변환 중 홈에서 새 리뷰를 시작하면 초기화하고 늦게 도착한 사진을 버린다', async (context) => {
    const conversion = mockImageConversion(context)
    await renderStrict(ReviewGenerator)
    await env.click(findButton('새 리뷰 만들기'))
    const fileInput = env.document.querySelector('input[type="file"]')
    await selectPhotos(fileInput, photo('draft.jpg'))
    assert.ok(findButton('사진을 준비하는 중…'))
    await env.click(env.document.querySelector('[aria-label="홈으로"]'))
    await env.click(findButton('새 리뷰 만들기'))
    assert.equal(env.document.querySelector('dialog').open, true)
    await env.click(findButton('새로 시작하기'))
    await conversion.complete()

    assert.equal(env.document.querySelector('.screen--compose').hidden, false)
    assert.equal(env.document.querySelector('.preview-frame'), null)
    assert.equal(findButton('키워드 추천받기').disabled, true)
    env.pagehide()
    assert.equal(readDraft().imageCount, 0)
  })

  test('키워드 추천 중 파일 선택·드롭·붙여넣기로 원본 사진을 교체할 수 없다', async (context) => {
    const conversion = mockImageConversion(context)
    let request, finishKeywords
    env.mockFetch(async (_url, init) => {
      request = JSON.parse(init.body)
      return new Promise((resolve) => { finishKeywords = resolve })
    })

    await renderStrict(ReviewGenerator)
    await env.click(findButton('새 리뷰 만들기'))
    const fileInput = env.document.querySelector('input[type="file"]')
    await selectPhotos(fileInput, photo('original.jpg'))
    await conversion.complete()
    await env.click(findButton('키워드 추천받기'))
    assert.equal(fileInput.disabled, true)
    assert.deepEqual(request.images, [{ imageBase64: 'YQ==', mimeType: 'image/jpeg' }])

    await selectPhotos(fileInput, photo('picked.jpg'))
    const addInput = env.document.querySelector('input[type="file"][hidden]')
    assert.equal(addInput.disabled, true)
    await selectPhotos(addInput, photo('added.jpg'))
    const dropTarget = env.document.querySelector('.file-drop')
    const drop = new env.window.Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [photo('dropped.jpg')] } })
    await env.act(() => dropTarget.dispatchEvent(drop))
    const paste = new env.window.Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(paste, 'clipboardData', { value: { files: [photo('pasted.jpg')] } })
    await env.act(() => env.document.body.dispatchEvent(paste))
    assert.equal(conversion.pending.length, 0)
    assert.equal(drop.defaultPrevented, true)
    assert.match(env.document.querySelector('.field__hint--file').textContent, /original\.jpg/)

    await env.act(async () => finishKeywords(Response.json({ ok: true, keywords: ['넓은 좌석', '조용한 음악', '따뜻한 조명'] })))
    assert.equal(env.document.querySelector('.screen--keywords').hidden, false)
    assert.ok(findButton('따뜻한 조명'))
    await env.click(env.document.querySelector('[aria-label="리뷰 재료 수정하기"]'))
    assert.match(env.document.querySelector('.field__hint--file').textContent, /original\.jpg/)
  })

  test('이미지 추가는 기존 사진을 유지하고 기존 사진을 포함해 최대 3장으로 제한한다', async (context) => {
    const conversion = mockImageConversion(context)
    await renderStrict(ReviewGenerator)
    await env.click(findButton('새 리뷰 만들기'))
    const fileInput = env.document.querySelector('input[type="file"]:not([hidden])')
    await selectPhotos(fileInput, photo('original.jpg'))
    await conversion.complete()

    const addInput = env.document.querySelector('input[type="file"][hidden]')
    const add = env.document.querySelector('[aria-label="이미지 추가"]')
    const openAdd = context.mock.method(addInput, 'click', () => {})
    await env.click(add)
    assert.equal(openAdd.mock.callCount(), 1)
    await selectPhotos(addInput, photo('additional.jpg'))
    assert.equal(env.document.querySelector('.upload-preview__count').textContent, '1/3장')
    await conversion.complete()
    assert.equal(env.document.querySelector('.upload-preview__count').textContent, '2/3장')
    assert.match(env.document.querySelector('.field__hint--file').textContent, /original\.jpg, additional\.jpg/)

    await env.click(add)
    await selectPhotos(addInput, photo('third.jpg'), photo('fourth.jpg'))
    assert.equal(conversion.pending.length, 0)
    assert.equal(env.document.querySelector('.upload-preview__count').textContent, '2/3장')
    assert.match(env.document.querySelector('.field__hint--error').textContent, /최대 3장/)
  })

  test('교체 취소나 변환 실패 후에도 기존 사진은 남고, 성공한 경우에만 교체된다', async (context) => {
    const conversion = mockImageConversion(context)
    await renderStrict(ReviewGenerator)
    await env.click(findButton('새 리뷰 만들기'))
    const fileInput = env.document.querySelector('input[type="file"]:not([hidden])')
    const currentPreview = () => env.document.querySelector('.preview-frame img').getAttribute('src')
    await selectPhotos(fileInput, photo('original.jpg'))
    await conversion.complete()
    const originalPreview = currentPreview()

    await selectPhotos(fileInput)
    assert.equal(currentPreview(), originalPreview)
    assert.match(env.document.querySelector('.field__hint--file').textContent, /original\.jpg/)

    await selectPhotos(fileInput, photo('broken.jpg'))
    assert.equal(currentPreview(), originalPreview)
    const broken = conversion.pending.shift()
    await env.act(async () => broken.onerror())
    assert.equal(currentPreview(), originalPreview)
    assert.match(env.document.querySelector('.field__hint--error').textContent, /이미지 변환에 실패/)
    assert.equal(findButton('키워드 추천받기').disabled, false)

    await selectPhotos(fileInput, photo('replacement.jpg'))
    await conversion.complete()
    assert.notEqual(currentPreview(), originalPreview)
    assert.equal(env.document.querySelector('.upload-preview__count').textContent, '1/3장')
    assert.match(env.document.querySelector('.field__hint--file').textContent, /replacement\.jpg/)
  })

  test('한글 조합 중 Enter는 입력을 유지하고 조합이 끝난 뒤 Enter는 키워드를 한 번 추가한다', async () => {
    saveFixture({ versionCount: 0 })
    await renderStrict(ReviewGenerator)
    await env.click(env.document.querySelector('.resume-card'))
    const input = env.document.querySelector('.screen--keywords .keyword-add input')
    const pressEnter = async (isComposing) => {
      const event = new env.window.KeyboardEvent('keydown', { key: 'Enter', isComposing, bubbles: true, cancelable: true })
      await env.act(() => input.dispatchEvent(event))
      return event.defaultPrevented
    }
    await env.type(input, '넉넉한 수납')

    assert.equal(await pressEnter(true), false)
    assert.equal(input.value, '넉넉한 수납')
    assert.equal(findButton('넉넉한 수납'), undefined)

    assert.equal(await pressEnter(false), true)
    assert.equal(input.value, '')
    const chips = [...env.document.querySelectorAll('.screen--keywords .chip')].filter((chip) => chip.textContent === '넉넉한 수납')
    assert.equal(chips.length, 1)
    assert.equal(chips[0].getAttribute('aria-pressed'), 'true')
  })

  test('사진만 올린 초안을 복원하면 홈에서 이어쓰고 재업로드 안내를 볼 수 있다', async () => {
    env.window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
      v: 1, category: 'place', inputMode: 'image', rating: 5, imageCount: 1,
    }))

    await renderStrict(ReviewGenerator)
    await env.click(env.document.querySelector('.resume-card'))
    assert.equal(env.document.querySelector('.screen--compose').hidden, false)
    assert.match(env.document.querySelector('.screen--compose .notice').textContent, /사진을 다시 올려 주세요/)
  })

  test('스트리밍 실패 시 미완성 초안 저장을 막고 10개 버전·선택·환불 횟수를 복원한다', async () => {
    const saved = saveFixture({ versionCount: 10, activeVersion: 4 })
    const api = createRef()
    let stream, generation
    await renderStrict(WorkspaceHarness, { apiRef: api })
    env.pagehide()
    const before = readDraft()
    env.mockFetch(async () => new Response(new ReadableStream({ start(controller) { stream = controller } }), {
      headers: { 'X-Review-Remaining': '19', 'X-Review-Reset': '60' },
    }))
    await env.act(async () => { generation = api.current.writeReview(); await Promise.resolve() })
    assert.equal(api.current.busy, 'review')
    assert.equal(api.current.versions.at(-1).n, 11)
    await env.act(async () => { stream.enqueue(new TextEncoder().encode('{"text":"미완성 리뷰"}\n')) })
    assert.equal(api.current.versions.at(-1).text, '미완성 리뷰')
    env.pagehide()
    assert.deepEqual(readDraft(), before)
    await env.act(async () => {
      stream.enqueue(new TextEncoder().encode('{"error":"스트림 실패","remaining":20}\n'))
      stream.close()
      await generation
    })
    assert.equal(api.current.busy, null)
    assert.equal(api.current.error.message, '스트림 실패')
    assert.equal(api.current.reviewsRemaining, 20)
    assert.equal(api.current.activeVersion, 4)
    assert.deepEqual(api.current.versions.map(({ text }) => text), saved.versions.map(({ text }) => text))
    env.pagehide()
    assert.equal(readDraft().activeVersion, 4)
    assert.equal(readDraft().versions[0].n, 1)
  })

  test('완료 표시 없이 끝난 스트림은 저장하지 않고 이전 10개 버전과 선택을 복원한다', async () => {
    const saved = saveFixture({ versionCount: 10, activeVersion: 4 })
    env.mockFetch(async () => new Response('{"text":"미완성 리뷰 조각"}\n'))
    await renderStrict(ReviewGenerator)
    await env.click(env.document.querySelector('.resume-card'))
    await env.click(findButton('다른 초안 만들기'))

    assert.match(env.document.querySelector('.screen--draft [role="alert"]').textContent, /완료되기 전에 연결이 끝났습니다/)
    assert.equal(env.document.querySelector('.version-tab[aria-pressed="true"]').textContent, 'v5')
    env.pagehide()
    assert.equal(readDraft().activeVersion, 4)
    assert.deepEqual(readDraft().versions.map(({ n, text }) => ({ n, text })), saved.versions.map(({ n, text }) => ({ n, text })))
  })

  test('다른 상품을 분석하고 새로고침한 뒤에도 이전 버전은 원본 근거로 다듬는다', async () => {
    const oldUrl = 'https://example.com/old'
    const newUrl = 'https://example.com/new'
    saveProductDraft(oldUrl, '이전 상품 A100')
    const reviews = []
    const original = '이전 상품 A100은 좌석이 넓어 앉아서 쉬기 편했어요.'
    env.mockFetch(async (_url, init) => {
      const body = JSON.parse(init.body)
      if (body.action === 'analyze-product') {
        return Response.json({ ok: true, url: newUrl, analysisStatus: 'ok', product: { name: '새 상품 B200' } })
      }
      if (body.action === 'keywords') {
        return Response.json({ ok: true, keywords: ['단단한 마감', '가벼운 무게', '작은 크기'] })
      }
      reviews.push(body)
      const text = reviews.length === 2 ? '새 상품 B200은 마감이 단단하고 크기가 작아서 써 보기 편했습니다.' : original
      return new Response(`${JSON.stringify({ text })}\n{"done":true}\n`)
    })

    await renderStrict(ReviewGenerator)
    await env.click(env.document.querySelector('.resume-card'))
    await env.click(findButton('리뷰 만들기'))

    await env.click(env.document.querySelector('[aria-label="키워드와 문체 수정하기"]'))
    await env.click(env.document.querySelector('[aria-label="리뷰 재료 수정하기"]'))
    await env.type(env.document.querySelector('input[type="url"]'), newUrl)
    await env.type(env.document.querySelector('.screen--compose textarea'), '새 상품은 손에 쥐기 편했어요.')
    await env.click(env.document.querySelector('[aria-label="2점"]'))
    await env.click(env.document.querySelector('input[type="radio"][value="electronics"]'))
    await env.click(findButton('바뀐 링크로 다시 분석하기'))
    await env.click(findButton('키워드 다시 추천받기'))
    await env.click(findButton('리뷰 만들기'))
    assert.match(reviews[1].productContext, /새 상품 B200/)
    assert.equal(reviews[1].rating, 2)
    assert.equal(reviews[1].subcategory, 'electronics')

    env.pagehide()
    await env.unmount()
    await renderStrict(ReviewGenerator)
    await env.click(env.document.querySelector('.resume-card'))
    await env.click(findButton('v1'))
    await env.click(findButton('더 자연스럽게'))

    const [first, , rewrite] = reviews
    assert.equal(rewrite.previousReview, original)
    for (const key of ['productContext', 'category', 'subcategory', 'rating', 'keywords', 'length', 'tone']) {
      assert.deepEqual(rewrite[key], first[key], key)
    }
    assert.equal(env.document.querySelector('[aria-label="입력에 없는 내용"]'), null)
    env.pagehide()
    assert.deepEqual(readDraft().versions.at(-1).generationContext, readDraft().versions[0].generationContext)
  })

  test('버전 전환은 편집·강조 선택만 초기화하고 실패한 다듬기 입력을 유지한다', async () => {
    let succeed = false
    function Harness() {
      const [versions, setVersions] = useState(createReviewDraft().versions)
      const [activeVersion, setActiveVersion] = useState(0)
      return createElement(ResultPanel, {
        versions, activeVersion, onSelectVersion: setActiveVersion,
        onEdit: (text) => setVersions((previous) => previous.map((version, index) => index === activeVersion ? { ...version, text } : version)),
        onRewrite: async () => succeed, onRegenerate() {}, onReset() {},
        disabled: false, isStreaming: false, canGenerate: true,
      })
    }
    await renderStrict(Harness)
    const input = env.document.querySelector('.rewrite input')
    await env.type(input, '조금 더 친근하게 써 주세요.')
    const submit = env.document.querySelector('.rewrite .keyword-add__button')
    assert.equal(submit.disabled, false)
    await env.click(submit)
    assert.equal(input.value, '조금 더 친근하게 써 주세요.')
    await env.click(env.document.querySelector('.review-meta__edit'))
    assert.ok(env.document.querySelector('textarea'))
    await env.click(env.document.querySelectorAll('.version-tab')[1])
    assert.equal(env.document.querySelector('textarea'), null)
    assert.equal(input.value, '조금 더 친근하게 써 주세요.')
    await env.click(env.document.querySelector('.review-mark'))
    assert.ok(env.document.querySelector('.review-mark[aria-pressed="true"]'))
    await env.click(env.document.querySelectorAll('.version-tab')[0])
    assert.equal(env.document.querySelector('.review-mark[aria-pressed="true"]'), null)
    succeed = true
    await env.click(submit)
    assert.equal(input.value, '')
  })

  // 특정 CSS 전체를 복제하는 스냅샷 대신 탐색·입력·작업 버튼의 사용 계약을 검사합니다.
  for (const restored of [false, true]) {
    for (const view of ['home', 'compose', 'keywords', 'draft']) {
      test(`${restored ? '복원' : '초기'} ${view} 화면의 표시와 CSS 적용 순서를 유지한다`, async () => {
        if (restored) saveFixture()
        await renderStrict(Workspace, { initialView: view, onReset() {} })
        const { document, window } = env
        assert.equal(document.querySelectorAll('h1').length, 1)
        assert.equal(document.querySelector('nav'), null)
        for (const screen of document.querySelectorAll('.screen')) {
          const active = screen.classList.contains(`screen--${view}`)
          assert.equal(screen.hidden, !active)
          assert.equal(window.getComputedStyle(screen).display, active ? 'grid' : 'none')
        }
        const footer = document.querySelector('.flow-actions')
        if (view === 'home') {
          assert.equal(footer, null)
          assert.equal(Boolean(document.querySelector('.resume-card')), restored)
        } else {
          assert.ok(footer)
          assert.equal(window.getComputedStyle(footer).position, 'fixed')
          assert.equal(footer.querySelectorAll('.btn--primary').length, 1)
          assert.equal(window.getComputedStyle(footer.querySelector('.btn--primary')).minHeight, '54px')
        }
        if (view === 'compose') {
          const photo = document.querySelector('.file-drop')
          const details = document.querySelector('.category-details')
          assert.ok(photo.compareDocumentPosition(details) & window.Node.DOCUMENT_POSITION_FOLLOWING)
          assert.equal(window.getComputedStyle(document.querySelector('.text-input')).fontSize, '16px')
          assert.equal(footer.querySelector('.btn--primary').disabled, !restored)
        }
        if (view === 'draft' && restored) {
          assert.match(document.querySelector('.review-versions').textContent, /이 리뷰의 버전/)
          assert.match(footer.textContent, /리뷰 복사하기/)
        }
      })
    }
  }
})

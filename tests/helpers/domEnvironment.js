import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'

// 실제 창·포트·외부 API 없이 React의 DOM 이벤트와 effect 생명주기를 검증합니다.
export async function createDomEnvironment() {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
  const descriptors = new Map()
  const frames = new Map()
  let nextFrame = 0
  let root = null
  let server = null
  const originalFetch = globalThis.fetch
  const globals = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    sessionStorage: dom.window.sessionStorage,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame },
    cancelAnimationFrame(id) { frames.delete(id) },
  }
  for (const [name, value] of Object.entries(globals)) {
    descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  }
  dom.window.matchMedia = () => ({ matches: false })
  dom.window.scrollTo = () => {}
  dom.window.HTMLElement.prototype.scrollIntoView = () => {}
  // jsdom은 모달의 실제 포커스 이동을 구현하지 않아 열림 상태만 모델링합니다.
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true }
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false }

  const restoreGlobals = () => {
    globalThis.fetch = originalFetch
    dom.window.close()
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete globalThis[name]
    }
  }

  try {
    const { createRoot } = await import('react-dom/client')
    const projectUrl = new URL('../../', import.meta.url)
    server = await createServer({
      root: fileURLToPath(projectUrl),
      server: { middlewareMode: true, ws: false, hmr: false, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
      appType: 'custom',
      logLevel: 'error',
    })
    // 애플리케이션과 같은 순서로 CSS를 로드해 파일 분리 후의 적용 결과도 검사합니다.
    const mainUrl = new URL('src/main.jsx', projectUrl)
    const source = await readFile(mainUrl, 'utf8')
    const imports = [...source.matchAll(/^import ['"](.+\.css)['"]/gm)]
    const styles = await Promise.all(imports.map(([, name]) => readFile(new URL(name, mainUrl), 'utf8')))
    const style = dom.window.document.createElement('style')
    style.textContent = styles.join('\n')
    dom.window.document.head.append(style)

    const unmount = async () => {
      if (!root) return
      const current = root
      root = null
      await act(() => current.unmount())
    }
    const flushFrames = async () => {
      await act(() => {
        const callbacks = [...frames.values()]
        frames.clear()
        callbacks.forEach((callback) => callback(0))
      })
    }
    const reset = async () => {
      try {
        await unmount()
      } finally {
        frames.clear()
        dom.window.sessionStorage.clear()
        dom.window.localStorage.clear()
        globalThis.fetch = async () => { throw new Error('DOM 테스트의 외부 요청은 명시적으로 모킹해야 합니다.') }
      }
    }
    await reset()

    return {
      window: dom.window,
      document: dom.window.document,
      act,
      loadModule: (name) => server.ssrLoadModule(`/src/components/ReviewGenerator/${name}`),
      mockFetch(handler) { globalThis.fetch = handler },
      async render(element) {
        root ??= createRoot(dom.window.document.getElementById('root'))
        await act(() => root.render(element))
        await flushFrames()
      },
      async click(element) {
        if (!element) throw new Error('클릭할 요소를 찾지 못했습니다.')
        await act(() => element.click())
        await flushFrames()
      },
      async type(element, value) {
        const prototype = element instanceof dom.window.HTMLTextAreaElement
          ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype
        await act(() => {
          Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value)
          element.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
        })
      },
      pagehide() { dom.window.dispatchEvent(new dom.window.Event('pagehide')) },
      unmount,
      reset,
      async close() {
        try { await unmount() } finally {
          try { await server.close() } finally { restoreGlobals() }
        }
      },
    }
  } catch (error) {
    try { await server?.close() } finally { restoreGlobals() }
    throw error
  }
}

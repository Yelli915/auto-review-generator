import { ACCESS_CHALLENGE_PATTERN } from './accessChallenge.js'

const RENDERED_PAGE_TIMEOUT_MS = 18000
const RENDERED_STABILIZE_MS = 1800

function isRenderedFetchDisabled() {
  return process.env.DISABLE_RENDERED_PRODUCT_FETCH === '1'
}

async function getChromiumExecutablePath(chromium) {
  const configuredPath =
    typeof process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH === 'string'
      ? process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.trim()
      : ''
  if (configuredPath) return configuredPath
  return chromium.executablePath()
}

export async function fetchRenderedProductInfo(urlString, userAgent) {
  if (isRenderedFetchDisabled()) return null

  let chromium
  let playwright
  try {
    ;[chromium, playwright] = await Promise.all([
      import('@sparticuz/chromium'),
      import('playwright-core'),
    ])
  } catch {
    return null
  }

  let browser
  try {
    const executablePath = await getChromiumExecutablePath(chromium.default)
    browser = await playwright.chromium.launch({
      args: chromium.default.args,
      executablePath,
      headless: chromium.default.headless,
    })
    const page = await browser.newPage({
      locale: 'ko-KR',
      userAgent,
      viewport: { width: 1365, height: 1800 },
    })
    page.setDefaultTimeout(RENDERED_PAGE_TIMEOUT_MS)

    await page.goto(urlString, {
      waitUntil: 'domcontentloaded',
      timeout: RENDERED_PAGE_TIMEOUT_MS,
    })
    await page
      .waitForLoadState('networkidle', {
        timeout: Math.min(RENDERED_PAGE_TIMEOUT_MS, 9000),
      })
      .catch(() => {})
    await page.waitForTimeout(RENDERED_STABILIZE_MS)

    return page.evaluate((accessChallengePattern) => {
      const accessChallengeRe = new RegExp(accessChallengePattern, 'i')
      const clean = (value) =>
        typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
      const firstText = (selectors) => {
        for (const selector of selectors) {
          for (const element of document.querySelectorAll(selector)) {
            const text = clean(element.textContent)
            if (text) return text
          }
        }
        return ''
      }
      const meta = (selector) =>
        clean(document.querySelector(selector)?.getAttribute('content') || '')
      const textMatching = (selectors, pattern) => {
        for (const selector of selectors) {
          for (const element of document.querySelectorAll(selector)) {
            const text = clean(element.textContent)
            if (text && pattern.test(text)) return text
          }
        }
        return ''
      }
      const firstImage = () => {
        const metaImage =
          meta('meta[property="og:image"]') ||
          meta('meta[name="twitter:image"]')
        if (metaImage) return metaImage

        const images = Array.from(document.images)
          .map((image) => ({
            src: image.currentSrc || image.src,
            width: image.naturalWidth || image.width || 0,
            height: image.naturalHeight || image.height || 0,
            alt: clean(image.alt),
            className: clean(image.className),
          }))
          .filter((image) => image.src && image.width >= 160 && image.height >= 160)
          .sort((a, b) => b.width * b.height - a.width * a.height)
        return (
          images.find((image) =>
            /product|goods|prd|item|main/i.test(
              `${image.alt} ${image.className} ${image.src}`,
            ),
          )?.src ||
          images[0]?.src ||
          ''
        )
      }

      const challengeText = clean(
        `${document.title} ${document.body?.innerText || ''}`.slice(0, 6000),
      )
      if (accessChallengeRe.test(challengeText)) return null

      const name =
        firstText([
          '[data-testid*="product" i][data-testid*="name" i]',
          '[class*="goods" i][class*="name" i]',
          '[class*="product" i][class*="name" i]',
          '[class*="prd" i][class*="name" i]',
          '[id*="goods" i][id*="name" i]',
          '[id*="product" i][id*="name" i]',
          'h1',
          'h2',
        ]) ||
        meta('meta[property="og:title"]') ||
        document.title
      const brand = firstText([
        '[data-testid*="brand" i]',
        '[class*="brand" i]',
        '[id*="brand" i]',
        '[class*="maker" i]',
      ])
      const price = textMatching(
        [
          '[data-testid*="price" i]',
          '[class*="price" i]',
          '[id*="price" i]',
          '[class*="prc" i]',
          '[class*="cost" i]',
          'strong',
          'em',
          'span',
        ],
        /(?:\d[\d,.\s]*원|₩\s*\d|KRW\s*\d|\d[\d,.\s]*(?:won|krw))/i,
      )
      const description =
        meta('meta[property="og:description"]') ||
        meta('meta[name="description"]')

      return {
        name: clean(name),
        brand: clean(brand),
        imageUrl: firstImage(),
        price: clean(price),
        description: clean(description),
        site:
          meta('meta[property="og:site_name"]') ||
          clean(location.hostname),
        url: location.href,
      }
    }, ACCESS_CHALLENGE_PATTERN)
  } catch {
    return null
  } finally {
    await browser?.close().catch(() => {})
  }
}

export function decodeHtmlEntities(text) {
  if (typeof text !== 'string') return ''
  const named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  }

  return text
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_, entity) => {
      const key = String(entity).toLowerCase()
      if (key.startsWith('#x')) {
        return String.fromCodePoint(Number.parseInt(key.slice(2), 16))
      }
      if (key.startsWith('#')) {
        return String.fromCodePoint(Number.parseInt(key.slice(1), 10))
      }
      return named[key] ?? ''
    })
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseAttributes(attrText) {
  const attrs = {}
  const re = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>`]+)))?/g
  let match
  while ((match = re.exec(attrText || '')) !== null) {
    const key = match[1].toLowerCase()
    attrs[key] = match[2] ?? match[3] ?? match[4] ?? ''
  }
  return attrs
}

// <meta>를 한 번만 훑어 property/name(소문자) → content 맵을 만듭니다. 같은 키는 처음 값을 씁니다.
export function readMetaTags(html) {
  const meta = new Map()
  const metaRe = /<meta\b([^>]*)>/gi
  let match
  while ((match = metaRe.exec(html)) !== null) {
    const attrs = parseAttributes(match[1] || '')
    const key = (attrs.property || attrs.name)?.toLowerCase()
    if (key && attrs.content && !meta.has(key)) {
      meta.set(key, decodeHtmlEntities(attrs.content))
    }
  }
  return meta
}

export function extractTitle(html, meta = readMetaTags(html)) {
  const ogTitle = meta.get('og:title')
  if (ogTitle) return ogTitle
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  return decodeHtmlEntities(title || '')
}

// start 위치의 { 또는 [ 부터 짝이 맞는 닫는 괄호까지 잘라 냅니다. 문자열 안의 괄호는 무시합니다.
export function sliceBalancedSegment(text, start) {
  const opening = text[start]
  const closing = opening === '{' ? '}' : opening === '[' ? ']' : ''
  if (!closing) return ''

  let depth = 0
  let inString = false
  let quote = ''
  let escaped = false

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === quote) {
        inString = false
        quote = ''
      }
      continue
    }

    if (ch === '"' || ch === "'") {
      inString = true
      quote = ch
      continue
    }
    if (ch === opening) depth += 1
    if (ch === closing) {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }

  return ''
}

export function tryParseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

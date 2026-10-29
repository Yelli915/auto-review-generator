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

export function extractMetaContent(html, selector) {
  const metaRe = /<meta\b([^>]*)>/gi
  let match
  while ((match = metaRe.exec(html)) !== null) {
    const attrs = parseAttributes(match[1] || '')
    const key = attrs.property || attrs.name
    if (key?.toLowerCase() === selector.toLowerCase() && attrs.content) {
      return decodeHtmlEntities(attrs.content)
    }
  }
  return ''
}

export function extractTitle(html) {
  const ogTitle = extractMetaContent(html, 'og:title')
  if (ogTitle) return ogTitle
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  return decodeHtmlEntities(title || '')
}

export function sliceBalancedSegment(text, { startIndex, openCh, closeCh } = {}) {
  if (typeof text !== 'string') return ''

  const start = Number.isInteger(startIndex)
    ? startIndex
    : text.indexOf(openCh)
  if (start < 0 || start >= text.length) return ''

  const opening = openCh || text[start]
  const closing =
    closeCh || (opening === '{' ? '}' : opening === '[' ? ']' : '')
  if (!opening || !closing || text[start] !== opening) return ''

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

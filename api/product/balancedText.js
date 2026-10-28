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

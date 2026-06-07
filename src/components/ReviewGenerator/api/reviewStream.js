export function createReviewStreamAccumulator(onChunk) {
  const safeOnChunk = typeof onChunk === 'function' ? onChunk : () => {}
  let fullText = ''
  let streamError = ''

  return {
    getError() {
      return streamError
    },
    getText() {
      return fullText
    },
    appendLine(line) {
      const payload = line.trim()
      if (!payload) return

      try {
        const json = JSON.parse(payload)
        const text = json?.text
        if (typeof json?.error === 'string' && json.error.trim()) {
          streamError = json.error.trim()
          return
        }
        if (text) {
          fullText += text
          safeOnChunk(fullText)
        }
      } catch {
        void 0
      }
    },
  }
}

import { useEffect, useRef, useState } from 'react'

export function useReviewClipboard(version, disabled) {
  const [result, setResult] = useState(null)
  const timerRef = useRef(null)
  useEffect(() => () => clearTimeout(timerRef.current), [])

  const copy = async () => {
    if (disabled || !version?.text.trim()) return
    let status = 'copied'
    try {
      await navigator.clipboard.writeText(version.text)
    } catch {
      status = 'failed'
    }
    setResult({ version: version.n, text: version.text, status })
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setResult(null), 2500)
  }

  const status = result && version && result.version === version.n && result.text === version.text
    ? result.status : 'idle'
  return { copy, status }
}

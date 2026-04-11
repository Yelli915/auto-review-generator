import { useState } from 'react'

export default function ReviewStep({ review, isStreaming }) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(review)
      setCopied(true)
      setCopyError(false)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyError(true)
      setTimeout(() => setCopyError(false), 2000)
    }
  }

  return (
    <div style={{ padding: '16px' }}>
      <div
        style={{
          minHeight: '160px',
          padding: '16px',
          border: '1px solid #ccc',
          borderRadius: '8px',
          lineHeight: '1.7',
          whiteSpace: 'pre-wrap',
          marginBottom: '16px',
          fontSize: '15px',
        }}
      >
        {review}
        {isStreaming && <span style={{ opacity: 0.5 }}>▌</span>}
      </div>

      <button
        onClick={handleCopy}
        disabled={isStreaming || !review}
        style={{ width: '100%', height: '52px', fontSize: '16px' }}
      >
        {copied ? '복사됨 ✓' : copyError ? '복사 실패' : '클립보드 복사'}
      </button>
    </div>
  )
}

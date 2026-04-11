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
    <div className="step-card">
      <h2 className="step-card__title">생성된 리뷰</h2>
      <div className="review-output" aria-live="polite">
        {review}
        {isStreaming && <span className="review-cursor" aria-hidden="true">▌</span>}
      </div>

      <button
        type="button"
        className="btn btn--primary btn--lg"
        onClick={handleCopy}
        disabled={isStreaming || !review}
      >
        {copied ? '복사됨 ✓' : copyError ? '복사 실패' : '클립보드에 복사'}
      </button>
      {copied && (
        <p className="field__hint copy-hint">붙여넣기 해서 사용하세요.</p>
      )}
    </div>
  )
}

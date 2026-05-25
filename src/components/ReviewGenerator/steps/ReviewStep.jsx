import { useState } from 'react'

export default function ReviewStep({
  review,
  isStreaming,
  onRegenerate,
  onReset,
}) {
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

  const trimmed = review.trim()
  const showWait = isStreaming && !trimmed

  return (
    <div className="step-card step-card--enter">
      <h2 className="step-card__title">생성된 리뷰</h2>

      <div
        className={
          showWait ? 'review-output review-output--placeholder' : 'review-output'
        }
        aria-live="polite"
        aria-busy={isStreaming}
      >
        {showWait ? '리뷰를 작성하는 중입니다…' : review}
        {isStreaming && trimmed ? (
          <span className="review-cursor" aria-hidden="true">
            |
          </span>
        ) : null}
      </div>

      <div className="btn-row review-nav">
        <button
          type="button"
          className="btn btn--primary btn--lg"
          onClick={handleCopy}
          disabled={isStreaming || !trimmed}
        >
          {copied ? '복사됨 ✓' : copyError ? '복사 실패' : '클립보드에 복사'}
        </button>
        {typeof onRegenerate === 'function' && (
          <button
            type="button"
            className="btn btn--secondary btn--lg"
            onClick={onRegenerate}
            disabled={isStreaming}
          >
            리뷰 다시 생성
          </button>
        )}
      </div>
      {typeof onReset === 'function' && (
        <button
          type="button"
          className="btn btn--secondary review-reset"
          onClick={onReset}
          disabled={isStreaming}
        >
          처음부터 다시 작성
        </button>
      )}
    </div>
  )
}

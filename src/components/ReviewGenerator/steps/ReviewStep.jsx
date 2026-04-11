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

  const trimmed = review.trim()
  const showWait = isStreaming && !trimmed

  return (
    <div className="step-card">
      <h2 className="step-card__title">생성된 리뷰</h2>
      <p className="step-card__lede">
        아래 문장을 복사해 쇼핑몰·앱 리뷰에 붙여넣을 수 있습니다.
      </p>
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
            ▌
          </span>
        ) : null}
      </div>

      <button
        type="button"
        className="btn btn--primary btn--lg"
        onClick={handleCopy}
        disabled={isStreaming || !trimmed}
      >
        {copied ? '복사됨 ✓' : copyError ? '복사 실패' : '클립보드에 복사'}
      </button>
      {copied && (
        <p className="field__hint copy-hint">붙여넣기 해서 사용하세요.</p>
      )}
    </div>
  )
}

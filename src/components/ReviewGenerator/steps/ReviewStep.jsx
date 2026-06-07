import { useEffect, useRef, useState } from 'react'

const REVIEW_REWRITE_ACTIONS = [
  { id: 'natural', label: '더 자연스럽게', instruction: '문장을 더 자연스럽고 실제 후기처럼 다듬어 주세요.' },
  { id: 'less-ad', label: '광고 느낌 줄이기', instruction: '광고 문구처럼 보이는 표현을 줄이고 담백한 사용 후기로 바꿔 주세요.' },
  { id: 'shorter', label: '짧게 줄이기', instruction: '핵심 경험은 유지하되 더 짧고 간결하게 줄여 주세요.' },
  { id: 'detail', label: '더 자세히', instruction: '입력 근거와 선택 키워드 안에서 구체적인 장면과 체감을 조금 더 자세히 풀어 주세요.' },
  { id: 'critical', label: '아쉬운 점 강조', instruction: '전체 톤은 유지하되 실제로 아쉬웠던 점이 더 분명히 드러나게 다듬어 주세요.' },
]

export default function ReviewStep({
  review,
  isStreaming,
  onRegenerate,
  onReset,
}) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const copiedTimeoutRef = useRef(null)
  const copyErrorTimeoutRef = useRef(null)

  const clearCopyTimers = () => {
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current)
    if (copyErrorTimeoutRef.current) clearTimeout(copyErrorTimeoutRef.current)
    copiedTimeoutRef.current = null
    copyErrorTimeoutRef.current = null
  }

  const scheduleCopiedReset = () => {
    copiedTimeoutRef.current = setTimeout(() => {
      setCopied(false)
      copiedTimeoutRef.current = null
    }, 2000)
  }

  const scheduleCopyErrorReset = () => {
    copyErrorTimeoutRef.current = setTimeout(() => {
      setCopyError(false)
      copyErrorTimeoutRef.current = null
    }, 2000)
  }

  useEffect(() => clearCopyTimers, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(review)
      clearCopyTimers()
      setCopied(true)
      setCopyError(false)
      scheduleCopiedReset()
    } catch {
      clearCopyTimers()
      setCopied(false)
      setCopyError(true)
      scheduleCopyErrorReset()
    }
  }

  const trimmed = review.trim()
  const showWait = isStreaming && !trimmed
  const canRewrite = typeof onRegenerate === 'function' && !isStreaming && Boolean(trimmed)

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
        {showWait ? '리뷰를 작성하는 중입니다...' : review}
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
          {copied ? '복사 완료' : copyError ? '복사 실패' : '클립보드에 복사'}
        </button>
      </div>

      {typeof onRegenerate === 'function' && (
        <div className="review-action-groups">
          <div className="review-action-group">
            <p className="review-action-group__label">새로 만들기</p>
            <button
              type="button"
              className="btn btn--secondary btn--lg"
              onClick={() => onRegenerate()}
              disabled={isStreaming}
            >
              같은 조건으로 다시 생성
            </button>
          </div>
          <div className="review-action-group review-more">
            <p className="review-action-group__label">기존 리뷰 다듬기</p>
            <p className="field__hint">현재 리뷰의 핵심 내용은 유지하고 표현만 바꿉니다.</p>
            <div className="review-more__actions">
              {REVIEW_REWRITE_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className="btn-link review-rewrite-action"
                  onClick={() => onRegenerate(action.instruction)}
                  disabled={!canRewrite}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

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

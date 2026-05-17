import { useState } from 'react'
import { REVIEW_CATEGORY_LABELS } from '../../../../shared/reviewCategories'
import {
  REVIEW_LENGTH_MAP,
  REVIEW_TONE_MAP,
} from '../../../../shared/reviewOptions'

export default function ReviewStep({
  review,
  isStreaming,
  onBack,
  onReset,
  onRegenerate,
  rating,
  ratingLabels,
  selectedKeywords,
  reviewLength,
  reviewTone,
  reviewCategory,
  imageCount,
}) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const [showMoreActions, setShowMoreActions] = useState(false)

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
  const charCount = trimmed.length

  const hasContext =
    imageCount > 0 ||
    reviewCategory ||
    rating != null ||
    (selectedKeywords && selectedKeywords.length > 0) ||
    reviewLength ||
    reviewTone

  return (
    <div className="step-card step-card--enter">
      <h2 className="step-card__title">생성된 리뷰</h2>
      <p className="step-card__lede">
        아래 문장을 복사해 필요한 리뷰란에 붙여넣을 수 있습니다.
      </p>

      {hasContext && (
        <div className="review-context">
          {imageCount > 0 && (
            <div className="review-context__row">
              <span className="review-context__icon">이미지</span>
              <span className="review-context__meta">{imageCount}장</span>
            </div>
          )}
          {reviewCategory && (
            <div className="review-context__row">
              <span className="review-context__icon">분야</span>
              <span className="review-context__meta">
                {REVIEW_CATEGORY_LABELS[reviewCategory] ?? '맛집'}
              </span>
            </div>
          )}
          {rating != null && (
            <div className="review-context__row">
              <span className="review-context__icon">별점</span>
              <div className="review-context__stars">
                {[1, 2, 3, 4, 5].map((s) => (
                  <span
                    key={s}
                    className={`star-sm${rating >= s ? ' star-sm--on' : ''}`}
                  >
                    ★
                  </span>
                ))}
                <span className="review-context__meta">
                  {rating}점 · {ratingLabels[rating]}
                </span>
              </div>
            </div>
          )}
          {(reviewLength || reviewTone) && (
            <div className="review-context__row">
              <span className="review-context__icon">옵션</span>
              <span className="review-context__meta">
                {[REVIEW_LENGTH_MAP[reviewLength]?.label, REVIEW_TONE_MAP[reviewTone]?.label]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
          )}
          {selectedKeywords && selectedKeywords.length > 0 && (
            <div className="review-context__row review-context__row--chips">
              <span className="review-context__icon">키워드</span>
              <div className="review-context__chips">
                {selectedKeywords.map((kw) => (
                  <span key={kw} className="context-chip">
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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

      {!isStreaming && trimmed && (
        <p className="review-meta">{charCount.toLocaleString()}자</p>
      )}

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

      <div className="btn-row review-nav">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={onBack}
          disabled={isStreaming}
        >
          키워드 다시 선택
        </button>
      </div>
      <div className="review-more">
        <button
          type="button"
          className="btn-link"
          onClick={() => setShowMoreActions((prev) => !prev)}
          disabled={isStreaming}
          aria-expanded={showMoreActions}
        >
          {showMoreActions ? '다른 작업 숨기기' : '다른 작업 보기'}
        </button>
        {showMoreActions && (
          <div className="btn-row review-more__actions">
            {typeof onRegenerate === 'function' && (
              <button
                type="button"
                className="btn btn--secondary"
                onClick={onRegenerate}
                disabled={isStreaming}
              >
                리뷰 다시 생성
              </button>
            )}
            <button
              type="button"
              className="btn btn--ghost review-reset"
              onClick={onReset}
              disabled={isStreaming}
            >
              처음으로 돌아가기
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

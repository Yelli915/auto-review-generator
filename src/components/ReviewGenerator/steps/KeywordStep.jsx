import { useEffect, useId, useMemo, useState } from 'react'
import {
  DEFAULT_REVIEW_LENGTH,
  DEFAULT_REVIEW_TONE,
  REVIEW_LENGTH_OPTIONS,
  REVIEW_TONE_OPTIONS,
} from '../../../../shared/reviewOptions'

const SKELETON_WIDTHS = [80, 96, 68, 110, 76, 90]

export default function KeywordStep({
  keywords,
  initialSelectedKeywords,
  initialLength = DEFAULT_REVIEW_LENGTH,
  initialTone = DEFAULT_REVIEW_TONE,
  onNext,
  onRefresh,
  onBackToUpload,
  isLoading,
}) {
  const lengthId = useId()
  const toneId = useId()
  const [reviewLength, setReviewLength] = useState(initialLength)
  const [reviewTone, setReviewTone] = useState(initialTone)
  const [selected, setSelected] = useState([])
  const list = useMemo(
    () => (Array.isArray(keywords) ? keywords : []),
    [keywords],
  )

  useEffect(() => {
    setReviewLength(initialLength)
  }, [initialLength])

  useEffect(() => {
    setReviewTone(initialTone)
  }, [initialTone])

  useEffect(() => {
    if (!Array.isArray(initialSelectedKeywords) || initialSelectedKeywords.length === 0) {
      setSelected([])
      return
    }
    const next = initialSelectedKeywords.filter((kw) => list.includes(kw))
    setSelected(Array.from(new Set(next)))
  }, [initialSelectedKeywords, list])

  const toggleKeyword = (keyword) => {
    setSelected((prev) =>
      prev.includes(keyword)
        ? prev.filter((k) => k !== keyword)
        : [...prev, keyword],
    )
  }

  const handleToggleAll = () => {
    setSelected(selected.length === list.length ? [] : [...list])
  }

  const isEmpty = list.length === 0
  const allSelected = list.length > 0 && selected.length === list.length

  return (
    <div className="step-card step-card--enter">
      </p>

      {isLoading && isEmpty ? (
        <div className="chip-skeleton-group" aria-label="키워드 생성 중" aria-busy="true">
          {SKELETON_WIDTHS.map((w, i) => (
            <div key={i} className="chip-skeleton" style={{ width: `${w}px` }} />
          ))}
        </div>
      ) : isEmpty ? (
        <div className="keyword-empty">
          <p>
            생성된 키워드가 없습니다. 아래에서 다시 시도하거나 이전 단계로 돌아가
            이미지를 바꿔 보세요.
          </p>
          {typeof onBackToUpload === 'function' && (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onBackToUpload}
              disabled={isLoading}
            >
              이미지 선택으로 돌아가기
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="keyword-header">
            <p className="step-section__label">
              키워드
              <span className="selection-badge" aria-live="polite">
                {selected.length}/{list.length}개 선택
              </span>
            </p>
            <button
              type="button"
              className="btn-link"
              onClick={handleToggleAll}
              disabled={isLoading}
            >
              {allSelected ? '전체 해제' : '전체 선택'}
            </button>
          </div>

          <div className="chip-group" role="group" aria-label="리뷰 키워드 선택">
            {list.map((keyword) => {
              const isOn = selected.includes(keyword)
              return (
                <button
                  key={keyword}
                  type="button"
                  className="chip"
                  aria-pressed={isOn}
                  disabled={isLoading}
                  onClick={() => toggleKeyword(keyword)}
                >
                  {keyword}
                </button>
              )
            })}
          </div>
        </>
      )}

      {!isEmpty && (
        <div className="step-section">
          <p className="step-section__label">리뷰 옵션</p>
          <div className="options-row options-row--2">
            <div className="field">
              <label className="field__label" htmlFor={lengthId}>
              </label>
              <select
                id={lengthId}
                className="select-input"
                value={reviewLength}
                onChange={(e) => setReviewLength(e.target.value)}
                disabled={isLoading}
              >
                {REVIEW_LENGTH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.controlLabel}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field__label" htmlFor={toneId}>
                말투
              </label>
              <select
                id={toneId}
                className="select-input"
                value={reviewTone}
                onChange={(e) => setReviewTone(e.target.value)}
                disabled={isLoading}
              >
                {REVIEW_TONE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.controlLabel}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="btn-row btn-row--tight btn-row--split">
        <button
          type="button"
          className="btn btn--primary btn--lg"
          onClick={() => onNext(selected, reviewLength, reviewTone)}
          disabled={selected.length === 0 || isEmpty || isLoading}
        >
          리뷰 작성
        </button>
      </div>
      <div className="btn-row btn-row--tight">
        <button
          type="button"
          className="btn-link"
          onClick={onRefresh}
          disabled={isLoading}
        >
          {isLoading ? '생성 중…' : '키워드 다시 생성'}
        </button>
      </div>
    </div>
  )
}

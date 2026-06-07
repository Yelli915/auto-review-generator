import { useEffect, useId, useMemo, useState } from 'react'
import {
  DEFAULT_REVIEW_LENGTH,
  DEFAULT_REVIEW_TONE,
  REVIEW_LENGTH_OPTIONS,
  REVIEW_TONE_OPTIONS,
  isSparseLongReview,
} from '../../../../shared/reviewOptions'

const SKELETON_WIDTHS = [80, 96, 68, 110, 76, 90]
const CUSTOM_KEYWORD_MAX_LENGTH = 30

function normalizeKeyword(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

function validateCustomKeyword(keyword, existingKeywords) {
  if (!keyword) return '추가할 키워드를 입력해 주세요.'
  if (keyword.length > CUSTOM_KEYWORD_MAX_LENGTH) {
    return `키워드는 ${CUSTOM_KEYWORD_MAX_LENGTH}자 이하로 입력해 주세요.`
  }
  if (keyword.split(/\s+/).length > 4) {
    return '키워드는 짧은 문구로 입력해 주세요.'
  }
  if (/[,:;!?'"`]/.test(keyword)) {
    return '쉼표나 따옴표 없이 짧은 문구로 입력해 주세요.'
  }
  if (existingKeywords.includes(keyword)) return '이미 추가된 키워드입니다.'
  return ''
}

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
  const customKeywordId = useId()
  const [reviewLength, setReviewLength] = useState(initialLength)
  const [reviewTone, setReviewTone] = useState(initialTone)
  const [selected, setSelected] = useState([])
  const [customKeywords, setCustomKeywords] = useState([])
  const [customKeywordInput, setCustomKeywordInput] = useState('')
  const [customKeywordError, setCustomKeywordError] = useState('')
  const list = useMemo(
    () => (Array.isArray(keywords) ? keywords.map(normalizeKeyword).filter(Boolean) : []),
    [keywords],
  )
  const allKeywords = useMemo(
    () => Array.from(new Set([...list, ...customKeywords])),
    [list, customKeywords],
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
    const normalized = initialSelectedKeywords.map(normalizeKeyword).filter(Boolean)
    const nextCustomKeywords = normalized.filter((kw) => !list.includes(kw))
    setCustomKeywords(Array.from(new Set(nextCustomKeywords)))
    setSelected(Array.from(new Set(normalized)))
  }, [initialSelectedKeywords, list])

  const toggleKeyword = (keyword) => {
    setSelected((prev) =>
      prev.includes(keyword)
        ? prev.filter((k) => k !== keyword)
        : [...prev, keyword],
    )
  }

  const handleToggleAll = () => {
    setSelected(selected.length === allKeywords.length ? [] : [...allKeywords])
  }

  const handleAddCustomKeyword = () => {
    const nextKeyword = normalizeKeyword(customKeywordInput)
    const error = validateCustomKeyword(nextKeyword, allKeywords)
    if (error) {
      setCustomKeywordError(error)
      return
    }
    setCustomKeywords((prev) => [...prev, nextKeyword])
    setSelected((prev) => Array.from(new Set([...prev, nextKeyword])))
    setCustomKeywordInput('')
    setCustomKeywordError('')
  }

  const handleRemoveCustomKeyword = (keyword) => {
    setCustomKeywords((prev) => prev.filter((item) => item !== keyword))
    setSelected((prev) => prev.filter((item) => item !== keyword))
  }

  const isEmpty = allKeywords.length === 0
  const allSelected = allKeywords.length > 0 && selected.length === allKeywords.length
  const showSparseLongWarning = isSparseLongReview(reviewLength, selected.length)
  const renderKeywordChip = (keyword, isCustom = false) => {
    const isOn = selected.includes(keyword)
    return (
      <span key={keyword} className="chip-wrap">
        <button
          type="button"
          className={`chip${isCustom ? ' chip--custom' : ''}`}
          aria-pressed={isOn}
          disabled={isLoading}
          onClick={() => toggleKeyword(keyword)}
        >
          {keyword}
        </button>
        {isCustom && (
          <button
            type="button"
            className="chip-remove"
            aria-label={`${keyword} 삭제`}
            disabled={isLoading}
            onClick={() => handleRemoveCustomKeyword(keyword)}
          >
            ×
          </button>
        )}
      </span>
    )
  }

  return (
    <div className="step-card step-card--enter">
      <h2 className="step-card__title">키워드 선택</h2>
      <p className="step-card__lede">
        키워드를 고르고 리뷰 분량과 말투를 선택하면 리뷰를 생성합니다.
      </p>

      <div className="field keyword-add">
        <label className="field__label" htmlFor={customKeywordId}>
          내 경험 키워드 추가
        </label>
        <div className="keyword-add__row">
          <input
            id={customKeywordId}
            className="text-input"
            value={customKeywordInput}
            maxLength={CUSTOM_KEYWORD_MAX_LENGTH}
            placeholder="예: 키감 좋음, 무게 아쉬움"
            disabled={isLoading}
            onChange={(e) => {
              setCustomKeywordInput(e.target.value)
              setCustomKeywordError('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAddCustomKeyword()
              }
            }}
          />
          <button
            type="button"
            className="btn btn--secondary keyword-add__button"
            onClick={handleAddCustomKeyword}
            disabled={isLoading || !customKeywordInput.trim()}
          >
            추가
          </button>
        </div>
        <p className={`field__hint ${customKeywordError ? 'field__hint--error' : ''}`}>
          {customKeywordError || '직접 겪은 장점이나 아쉬운 점을 짧은 문구로 추가할 수 있습니다.'}
        </p>
      </div>

      {isLoading && isEmpty ? (
        <div className="chip-skeleton-group" aria-label="키워드 생성 중" aria-busy="true">
          {SKELETON_WIDTHS.map((w, i) => (
            <div key={i} className="chip-skeleton" style={{ width: `${w}px` }} />
          ))}
        </div>
      ) : isEmpty ? (
        <div className="keyword-empty">
          <p>
            생성된 키워드가 없습니다. 위에 직접 경험 키워드를 추가하거나, 이전 단계로
            돌아가 이미지를 바꿔 보세요.
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
                {selected.length}/{allKeywords.length}개 선택
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

          <div className="keyword-source-list">
            {list.length > 0 && (
              <div className="keyword-source">
                <p className="keyword-source__label">자동 생성 키워드</p>
                <div className="chip-group" role="group" aria-label="자동 생성 키워드 선택">
                  {list.map((keyword) => renderKeywordChip(keyword))}
                </div>
              </div>
            )}
            {customKeywords.length > 0 && (
              <div className="keyword-source">
                <p className="keyword-source__label">내가 추가한 키워드</p>
                <div className="chip-group" role="group" aria-label="직접 추가한 키워드 선택">
                  {customKeywords.map((keyword) => renderKeywordChip(keyword, true))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {!isEmpty && (
        <div className="step-section">
          <p className="step-section__label">리뷰 옵션</p>
          <div className="options-row options-row--2">
            <div className="field">
              <label className="field__label" htmlFor={lengthId}>
                분량
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
          {showSparseLongWarning && (
            <p className="field__hint" role="status">
              선택한 키워드가 적어 긴 리뷰는 조금 더 일반적으로 작성될 수 있습니다.
            </p>
          )}
        </div>
      )}

      <div className="btn-row btn-row--tight btn-row--split">
        <button
          type="button"
          className="btn btn--primary btn--lg"
          onClick={() => onNext(selected, reviewLength, reviewTone)}
          disabled={selected.length === 0 || isLoading}
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
          {isLoading ? '생성 중...' : '키워드 다시 생성'}
        </button>
      </div>
    </div>
  )
}

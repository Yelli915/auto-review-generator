import { useId, useState } from 'react'
import {
  getReviewMinChars,
  REVIEW_LENGTH_OPTIONS,
  REVIEW_TONE_OPTIONS,
  isSparseLongReview,
} from '#shared/reviewOptions'
import {
  isLikelyKeywordPhrase,
  KEYWORD_LEN_MAX,
  normalizeKeywordText,
} from '#shared/keywordPhrase'
import ChoiceGroup from './ChoiceGroup'

const SKELETON_WIDTHS = [80, 96, 68, 110, 76, 90]

// 서버가 리뷰 프롬프트에서 쓰는 규칙(isLikelyKeywordPhrase)과 같아서, 여기서 통과한 키워드는 서버에서 빠지지 않습니다.
function validateCustomKeyword(keyword, existingKeywords) {
  if (!keyword) return '추가할 키워드를 입력해 주세요.'
  if (keyword.length > KEYWORD_LEN_MAX) {
    return `키워드는 ${KEYWORD_LEN_MAX}자 이하로 입력해 주세요.`
  }
  if (existingKeywords.includes(keyword)) return '이미 추가된 키워드입니다.'
  if (!isLikelyKeywordPhrase(keyword)) {
    return '문장 대신 4단어 이하의 짧은 명사형 문구로 입력해 주세요. 예: 키감 좋음'
  }
  return ''
}

export default function KeywordSection({
  sectionRef,
  hasSource,
  isLoading,
  disabled,
  stale,
  keywords,
  customKeywords,
  selected,
  onToggle,
  onToggleAll,
  onAddCustom,
  onRemoveCustom,
  onRefresh,
  canRefresh,
  length,
  onLengthChange,
  tone,
  onToneChange,
  onGenerate,
  canGenerate,
  isGenerating,
  error,
}) {
  const customKeywordId = useId()
  const [customInput, setCustomInput] = useState('')
  const [customError, setCustomError] = useState('')
  // 추천 키워드는 서버(sanitizeKeywordArray)에서 이미 정리되어 옵니다.
  const list = keywords
  // 추천 목록에 이미 있는 직접 추가 키워드는 추천 칩 하나로만 보여 줍니다.
  const extraCustom = customKeywords.filter((keyword) => !list.includes(keyword))
  const allKeywords = [...list, ...extraCustom]
  const allSelected = allKeywords.length > 0 && selected.length === allKeywords.length

  const handleAddCustom = () => {
    const next = normalizeKeywordText(customInput)
    const validationError = validateCustomKeyword(next, allKeywords)
    if (validationError) {
      setCustomError(validationError)
      return
    }
    onAddCustom(next)
    setCustomInput('')
    setCustomError('')
  }

  const renderChip = (keyword, isCustom = false) => (
    <span key={keyword} className="chip-wrap">
      <button
        type="button"
        className={`chip${isCustom ? ' chip--custom' : ''}`}
        aria-pressed={selected.includes(keyword)}
        disabled={disabled}
        onClick={() => onToggle(keyword)}
      >
        {keyword}
      </button>
      {isCustom && (
        <button
          type="button"
          className="chip-remove"
          aria-label={`${keyword} 삭제`}
          disabled={disabled}
          onClick={() => onRemoveCustom(keyword)}
        >
          ×
        </button>
      )}
    </span>
  )

  return (
    <section className="panel" aria-labelledby="section-keywords" ref={sectionRef}>
      <h2 className="panel__title" id="section-keywords">
        키워드와 문체
        {allKeywords.length > 0 && (
          <span className="selection-badge" aria-live="polite">
            {selected.length}/{allKeywords.length}개 선택
          </span>
        )}
      </h2>

      {isLoading && !list.length ? (
        <div className="chip-skeleton-group" aria-label="키워드 생성 중" aria-busy="true">
          {SKELETON_WIDTHS.map((w, i) => (
            <div key={i} className="chip-skeleton" style={{ width: `${w}px` }} />
          ))}
        </div>
      ) : !hasSource ? (
        <p className="panel__empty">
          위에서 재료를 넣고 키워드를 만들면, 여기서 리뷰에 담을 키워드를 고릅니다.
        </p>
      ) : (
        <>
          {stale && (
            <p className="notice" role="status">
              입력이 바뀌었습니다. 지금 키워드는 이전 입력 기준이니, 필요하면 위에서 키워드를 다시 만들어 주세요.
            </p>
          )}

          {list.length > 0 ? (
            <div className="chip-group" role="group" aria-label="추천 키워드">
              {list.map((keyword) => renderChip(keyword))}
            </div>
          ) : (
            <p className="panel__empty">추천 키워드가 없습니다. 직접 경험한 키워드를 추가해 주세요.</p>
          )}

          {extraCustom.length > 0 && (
            <div className="chip-group" role="group" aria-label="직접 추가한 키워드">
              {extraCustom.map((keyword) => renderChip(keyword, true))}
            </div>
          )}

          <div className="keyword-tools">
            {allKeywords.length > 0 && (
              <button type="button" className="btn-link" onClick={onToggleAll} disabled={disabled}>
                {allSelected ? '전체 해제' : '전체 선택'}
              </button>
            )}
            <button type="button" className="btn-link" onClick={onRefresh} disabled={disabled || !canRefresh}>
              {isLoading ? '추천 중...' : '다른 키워드 추천'}
            </button>
          </div>

          <div className="field keyword-add">
            <label className="field__label" htmlFor={customKeywordId}>
              내 경험 키워드 추가
            </label>
            <div className="keyword-add__row">
              <input
                id={customKeywordId}
                className="text-input"
                value={customInput}
                maxLength={KEYWORD_LEN_MAX}
                placeholder="예: 키감 좋음, 무게 아쉬움"
                disabled={disabled}
                onChange={(e) => {
                  setCustomInput(e.target.value)
                  setCustomError('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddCustom()
                  }
                }}
              />
              <button
                type="button"
                className="btn btn--secondary keyword-add__button"
                onClick={handleAddCustom}
                disabled={disabled || !customInput.trim()}
              >
                추가
              </button>
            </div>
            {customError && <p className="field__hint field__hint--error">{customError}</p>}
          </div>

          <div className="options-row options-row--2">
            <ChoiceGroup
              legend="분량"
              options={REVIEW_LENGTH_OPTIONS}
              value={length}
              onChange={onLengthChange}
              disabled={disabled}
              hint={`최소 ${getReviewMinChars(length)}자 이상으로 작성합니다.`}
            />
            <ChoiceGroup
              legend="말투"
              options={REVIEW_TONE_OPTIONS}
              value={tone}
              onChange={onToneChange}
              disabled={disabled}
            />
          </div>
          {isSparseLongReview(length, selected.length) && (
            <p className="field__hint" role="status">
              선택한 키워드가 적어 긴 리뷰는 조금 더 일반적으로 작성될 수 있습니다.
            </p>
          )}
        </>
      )}

      {error && <p className="banner banner--error" role="alert">{error}</p>}
      {hasSource && (
        <div className="sticky-cta">
          <button
            type="button"
            className="btn btn--primary btn--lg"
            onClick={onGenerate}
            disabled={!canGenerate || disabled}
            aria-busy={isGenerating}
          >
            {isGenerating ? '리뷰 작성 중...' : selected.length ? '리뷰 생성' : '키워드를 1개 이상 고르세요'}
          </button>
        </div>
      )}
    </section>
  )
}

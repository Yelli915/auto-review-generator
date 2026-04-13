import { useEffect, useId, useMemo, useState } from 'react'

const SKELETON_WIDTHS = [80, 96, 68, 110, 76, 90]

export default function KeywordStep({
  keywords,
  onNext,
  onRefresh,
  onBackToUpload,
  isLoading,
}) {
  const lengthId = useId()
  const toneId = useId()
  const [reviewLength, setReviewLength] = useState('medium')
  const [reviewTone, setReviewTone] = useState('neutral')
  const [selected, setSelected] = useState([])
  const list = useMemo(
    () => (Array.isArray(keywords) ? keywords : []),
    [keywords],
  )

  useEffect(() => {
    setSelected([])
  }, [keywords])

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
      <h2 className="step-card__title">키워드·길이·말투</h2>
      <p className="step-card__lede">
        키워드를 고르고 리뷰 길이와 말투를 선택한 뒤 리뷰를 생성합니다.
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
                길이
              </label>
              <select
                id={lengthId}
                className="select-input"
                value={reviewLength}
                onChange={(e) => setReviewLength(e.target.value)}
                disabled={isLoading}
              >
                <option value="short">짧게 (2~3문장)</option>
                <option value="medium">보통 (4~5문장)</option>
                <option value="long">길게 (7~8문장)</option>
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
                <option value="neutral">기본 (자연스럽게)</option>
                <option value="friendly">친근 (친구처럼)</option>
                <option value="formal">격식 (정중하게)</option>
                <option value="casual">반말 (편하게)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="btn-row btn-row--tight btn-row--split">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={onRefresh}
          disabled={isLoading}
        >
          {isLoading ? '생성 중…' : '키워드 다시 생성'}
        </button>

        <button
          type="button"
          className="btn btn--primary btn--lg"
          onClick={() => onNext(selected, reviewLength, reviewTone)}
          disabled={selected.length === 0 || isEmpty || isLoading}
        >
          리뷰 작성
        </button>
      </div>
    </div>
  )
}

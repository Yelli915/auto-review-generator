import { useEffect, useId, useMemo, useState } from 'react'

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

  const isEmpty = list.length === 0

  return (
    <div className="step-card">
      <h2 className="step-card__title">키워드·길이·말투</h2>
      <p className="step-card__lede">
        키워드를 고르고, 리뷰 길이와 말투를 정한 뒤 리뷰를 생성합니다.
      </p>

      {isEmpty ? (
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
        <div className="chip-group" role="group" aria-label="리뷰 키워드 선택">
          {list.map((keyword, index) => {
            const isOn = selected.includes(keyword)
            return (
              <button
                key={`${index}-${keyword}`}
                type="button"
                className="chip"
                aria-pressed={isOn}
                onClick={() => toggleKeyword(keyword)}
              >
                {keyword}
              </button>
            )
          })}
        </div>
      )}

      <div className="field">
        <label className="field__label" htmlFor={lengthId}>
          리뷰 길이
        </label>
        <select
          id={lengthId}
          className="select-input"
          value={reviewLength}
          onChange={(e) => setReviewLength(e.target.value)}
          disabled={isLoading}
          aria-describedby={`${lengthId}-hint`}
        >
          <option value="short">짧게</option>
          <option value="medium">보통</option>
          <option value="long">길게</option>
        </select>
        <p className="field__hint" id={`${lengthId}-hint`}>
          선택한 키워드를 바탕으로 이 길이에 맞게 작성합니다.
        </p>
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
          aria-describedby={`${toneId}-hint`}
        >
          <option value="neutral">기본 (자연스러운 리뷰)</option>
          <option value="friendly">친근하게</option>
          <option value="formal">정중·격식</option>
          <option value="casual">편한 반말</option>
        </select>
        <p className="field__hint" id={`${toneId}-hint`}>
          전체 문장의 말투를 이에 맞춥니다.
        </p>
      </div>

      <div className="btn-row btn-row--tight">
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
          disabled={selected.length === 0 || isEmpty}
        >
          리뷰 작성
        </button>
      </div>
    </div>
  )
}

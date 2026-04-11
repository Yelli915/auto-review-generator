import { useEffect, useMemo, useState } from 'react'

export default function KeywordStep({
  keywords,
  onNext,
  onRefresh,
  onBackToUpload,
  isLoading,
}) {
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
      <h2 className="step-card__title">키워드 선택</h2>
      <p className="step-card__lede">
        리뷰에 넣고 싶은 표현을 골라 주세요. 여러 개 선택할 수 있습니다.
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
          onClick={() => onNext(selected)}
          disabled={selected.length === 0 || isEmpty}
        >
          리뷰 작성
        </button>
      </div>
    </div>
  )
}

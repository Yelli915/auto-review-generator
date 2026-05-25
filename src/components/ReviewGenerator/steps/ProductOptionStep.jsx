import { useMemo, useState } from 'react'

function getDefaultSelections(optionGroups) {
  return Array.isArray(optionGroups)
    ? optionGroups.map((group) => group?.options?.[0]?.value || '')
    : []
}

export default function ProductOptionStep({
  analysis,
  initialSelections,
  onNext,
  onBack,
  isLoading,
}) {
  const optionGroups = useMemo(
    () => (Array.isArray(analysis?.optionGroups) ? analysis.optionGroups : []),
    [analysis],
  )
  const [selections, setSelections] = useState(
    () => {
      const defaults = getDefaultSelections(optionGroups)
      if (Array.isArray(initialSelections) && initialSelections.length) {
        return defaults.map((value, index) => {
          const candidate = initialSelections[index]
          return optionGroups[index]?.options?.some(
            (option) => option.value === candidate,
          )
            ? candidate
            : value
        })
      }
      return defaults
    },
  )

  const canContinue =
    optionGroups.length > 0 &&
    optionGroups.every((group, index) => selections[index] && group?.options?.length)

  return (
    <section className="step-card step-card--enter">
      <h2 className="step-card__title">상품 옵션 선택</h2>
      <p className="step-card__lede">
        URL에서 감지한 옵션을 선택하면 그 값이 키워드 생성에 반영됩니다.
      </p>

      {analysis?.url && (
        <div className="product-analysis">
          <p className="product-analysis__label">분석한 링크</p>
          <p className="product-analysis__text">{analysis.url}</p>
        </div>
      )}

      {analysis?.productContext && (
        <div className="product-analysis product-analysis--muted">
          <p className="product-analysis__label">상품 정보</p>
          <p className="product-analysis__text">{analysis.productContext}</p>
        </div>
      )}

      <div className="step-section">
        {optionGroups.map((group, index) => (
          <div key={`${group.id || group.label || index}`} className="field">
            <label className="field__label" htmlFor={`product-option-${index}`}>
              {group.label || `옵션 ${index + 1}`}
            </label>
            <select
              id={`product-option-${index}`}
              className="select-input"
              value={selections[index] || ''}
              onChange={(e) => {
                const value = e.target.value
                setSelections((prev) => {
                  const next = [...prev]
                  next[index] = value
                  return next
                })
              }}
              disabled={isLoading}
            >
              {Array.isArray(group.options) &&
                group.options.map((option) => (
                  <option key={`${option.value}::${option.label}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
            </select>
          </div>
        ))}
      </div>

      <div className="btn-row">
        <button
          type="button"
          className="btn btn--primary btn--lg"
          onClick={() => onNext?.(selections)}
          disabled={!canContinue || isLoading}
        >
          옵션 반영하고 키워드 생성
        </button>
        {typeof onBack === 'function' && (
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onBack}
            disabled={isLoading}
          >
            URL 다시 입력
          </button>
        )}
      </div>
    </section>
  )
}

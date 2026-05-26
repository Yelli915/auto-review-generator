import { useMemo, useState } from 'react'

function normalizeInitialType(candidates, initialType) {
  if (typeof initialType !== 'string' || !initialType.trim()) return ''
  const value = initialType.trim()
  return candidates.includes(value) ? value : value
}

export default function ProductTypeStep({
  candidates,
  initialType,
  analysis,
  onNext,
  onBack,
  isLoading,
}) {
  const list = useMemo(
    () =>
      Array.isArray(candidates)
        ? candidates.filter((candidate) => typeof candidate === 'string' && candidate.trim())
        : [],
    [candidates],
  )
  const [selectedType, setSelectedType] = useState(() =>
    normalizeInitialType(list, initialType) || list[0] || '',
  )
  const [customType, setCustomType] = useState('')
  const customSelected = selectedType === '__custom__'
  const finalType = customSelected ? customType.trim() : selectedType.trim()
  const canContinue = finalType.length > 0

  return (
    <section className="step-card step-card--enter">
      <h2 className="step-card__title">상품 유형 선택</h2>
      <p className="step-card__lede">
        분석 결과에서 리뷰 대상에 가장 가까운 상품 유형을 먼저 고르면 키워드가 더 구체적으로 생성됩니다.
      </p>

      {analysis?.url && (
        <div className="product-analysis">
          <p className="product-analysis__label">분석한 링크</p>
          <p className="product-analysis__text">{analysis.url}</p>
        </div>
      )}

      <div className="product-type-list" role="radiogroup" aria-label="상품 유형 후보">
        {list.map((candidate) => (
          <label
            key={candidate}
            className={`product-type-option ${
              selectedType === candidate ? 'is-active' : ''
            }`}
          >
            <input
              type="radio"
              name="product-type"
              value={candidate}
              checked={selectedType === candidate}
              onChange={() => setSelectedType(candidate)}
              disabled={isLoading}
            />
            <span>{candidate}</span>
          </label>
        ))}

        <label
          className={`product-type-option ${
            customSelected ? 'is-active' : ''
          }`}
        >
          <input
            type="radio"
            name="product-type"
            value="__custom__"
            checked={customSelected}
            onChange={() => setSelectedType('__custom__')}
            disabled={isLoading}
          />
          <span>직접 입력</span>
        </label>
      </div>

      {customSelected && (
        <div className="field">
          <label className="field__label" htmlFor="product-type-custom">
            상품 유형
          </label>
          <input
            id="product-type-custom"
            className="text-input"
            type="text"
            value={customType}
            onChange={(e) => setCustomType(e.target.value)}
            placeholder="예: 무선 이어폰, 트레이닝 반바지"
            disabled={isLoading}
          />
        </div>
      )}

      <div className="btn-row">
        <button
          type="button"
          className="btn btn--primary btn--lg"
          onClick={() => onNext?.(finalType)}
          disabled={!canContinue || isLoading}
        >
          상품 유형 반영
        </button>
        <div className="btn-row btn-row--tight btn-row--split">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => onNext?.('')}
            disabled={isLoading}
          >
            건너뛰기
          </button>
          {typeof onBack === 'function' && (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onBack}
              disabled={isLoading}
            >
              다시 입력
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

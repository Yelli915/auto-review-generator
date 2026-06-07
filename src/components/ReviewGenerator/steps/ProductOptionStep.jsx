import { useState } from 'react'
import {
  canContinueWithProductInfo,
  hasConfirmedProductInfo,
  mergeOptionSelections,
  needsManualProductInfo,
  normalizeProductInfo,
  normalizeOptionGroups,
} from '../utils/productOptions'

const PRODUCT_FIELDS = [
  {
    key: 'name',
    label: '상품명',
    requiredForManual: true,
    placeholder: '예: 무선 키보드, 선크림, 티셔츠',
  },
  {
    key: 'brand',
    label: '브랜드',
    placeholder: '브랜드명',
  },
  {
    key: 'price',
    label: '가격',
    placeholder: '예: 19,900원',
  },
  {
    key: 'imageUrl',
    label: '이미지 URL',
    placeholder: 'https://...',
  },
  {
    key: 'description',
    label: '상품 특징',
    requiredForManual: true,
    placeholder: '예: 조용한 키감, 촉촉한 제형, 넉넉한 수납공간',
  },
]

const ANALYSIS_STATUS_META = {
  ok: {
    label: '분석 성공',
    className: '',
    message: '상품 페이지에서 주요 정보를 자동으로 가져왔습니다.',
  },
  rendered: {
    label: '분석 성공',
    className: '',
    message: '동적 렌더링 결과에서 상품 정보를 가져왔습니다.',
  },
  reader: {
    label: '부분 성공',
    className: 'product-analysis--warning',
    message: '상품 페이지 일부만 읽었습니다. 부족한 내용은 직접 보완해 주세요.',
  },
  fallback: {
    label: '부분 성공',
    className: 'product-analysis--warning',
    message: '상품 페이지 접근이 제한되어 URL에서 추정한 정보만 사용합니다.',
  },
  failed: {
    label: '분석 실패',
    className: 'product-analysis--warning',
    message: '상품 페이지를 자동으로 읽지 못했습니다. 아래에 상품 정보를 직접 입력해 주세요.',
  },
}

function getAnalysisStatusMeta(analysis) {
  return ANALYSIS_STATUS_META[analysis?.analysisStatus] || ANALYSIS_STATUS_META.ok
}

function getNextRequirement(requiresManualProductInfo) {
  return requiresManualProductInfo
    ? '상품명 또는 상품 특징 중 하나를 입력하면 계속 진행할 수 있습니다.'
    : '자동 수집 정보가 맞는지 확인하고 필요한 부분만 보완해 주세요.'
}

function ProductInfoCard({ product }) {
  const meta = [product.brand, product.price].filter(Boolean).join(' · ')

  return (
    <div className="product-info-card">
      {product.imageUrl && (
        <div className="product-info-card__image">
          <img src={product.imageUrl} alt={product.name || '상품 이미지'} />
        </div>
      )}
      <div className="product-info-card__body">
        <p className="product-info-card__label">확인한 상품 정보</p>
        <p className="product-info-card__title">
          {product.name || '상품명을 직접 입력해 주세요'}
        </p>
        <p className="product-info-card__meta">
          {meta || '브랜드나 가격을 알고 있다면 보완해 주세요'}
        </p>
      </div>
    </div>
  )
}

function ProductField({ field, value, onChange, disabled, showRequiredHint }) {
  const inputId = `product-${field.key}`
  return (
    <div className="field">
      <label className="field__label" htmlFor={inputId}>
        {field.label}
        {showRequiredHint && field.requiredForManual && (
          <span className="field__label-note">둘 중 하나 필요</span>
        )}
      </label>
      <input
        id={inputId}
        className="text-input"
        value={value}
        onChange={(e) => onChange(field.key, e.target.value)}
        disabled={disabled}
        placeholder={field.placeholder}
      />
    </div>
  )
}

function ProductOptionFields({
  optionGroups,
  selections,
  setSelections,
  disabled,
}) {
  if (!optionGroups.length) return null

  return (
    <div className="step-section">
      <p className="step-section__label">상품 옵션</p>
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
            disabled={disabled}
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
  )
}

export default function ProductOptionStep({
  analysis,
  initialSelections,
  onNext,
  onBack,
  isLoading,
}) {
  const optionGroups = normalizeOptionGroups(analysis?.optionGroups)
  const [product, setProduct] = useState(() => ({
    ...normalizeProductInfo(analysis?.product, analysis?.url || ''),
  }))
  const [selections, setSelections] = useState(
    () => mergeOptionSelections(optionGroups, initialSelections),
  )

  const statusMeta = getAnalysisStatusMeta(analysis)
  const requiresManualProductInfo = needsManualProductInfo(analysis)
  const hasManualProductInfo = hasConfirmedProductInfo(product)
  const canContinue = canContinueWithProductInfo({
    analysis,
    optionGroups,
    product,
    selections,
  })
  const nextRequirement = getNextRequirement(requiresManualProductInfo)

  const updateProduct = (field, value) => {
    setProduct((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <section className="step-card step-card--enter">
      <h2 className="step-card__title">상품 정보 확인</h2>
      <p className="step-card__lede">
        자동 분석 결과를 확인하고, 부족한 내용은 직접 보완한 뒤 키워드를 생성합니다.
      </p>

      <div
        className={`flow-callout ${canContinue ? 'flow-callout--ready' : ''}`}
        role="status"
      >
        <p className="flow-callout__label">
          {canContinue ? '다음 단계 가능' : '진행 조건'}
        </p>
        <p className="flow-callout__text">
          {canContinue
            ? '상품 정보와 옵션을 반영해 키워드를 만들 수 있습니다.'
            : nextRequirement}
        </p>
      </div>

      <div className={`product-analysis ${statusMeta.className}`} role="status">
        <p className="product-analysis__label">{statusMeta.label}</p>
        <p className="product-analysis__text">
          {analysis?.warning || statusMeta.message}
        </p>
      </div>

      {analysis?.url && (
        <div className="product-analysis">
          <p className="product-analysis__label">분석한 링크</p>
          <p className="product-analysis__text">{analysis.url}</p>
        </div>
      )}

      {analysis?.productContext && (
        <div className="product-analysis product-analysis--muted">
          <p className="product-analysis__label">자동 수집 정보</p>
          <p className="product-analysis__text">{analysis.productContext}</p>
        </div>
      )}

      <ProductInfoCard product={product} />

      <div className="step-section">
        <p className="step-section__label">상품 정보 보완</p>
        <div className="options-row options-row--2">
          {PRODUCT_FIELDS.map((field) => (
            <ProductField
              key={field.key}
              field={field}
              value={product[field.key]}
              onChange={updateProduct}
              disabled={isLoading}
              showRequiredHint={requiresManualProductInfo}
            />
          ))}
        </div>
      </div>

      <ProductOptionFields
        optionGroups={optionGroups}
        selections={selections}
        setSelections={setSelections}
        disabled={isLoading}
      />

      <div className="btn-row">
        <button
          type="button"
          className="btn btn--primary btn--lg"
          onClick={() => onNext?.(selections, product)}
          disabled={!canContinue || isLoading}
        >
          상품 정보 반영하고 키워드 생성
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
      {requiresManualProductInfo && !hasManualProductInfo && (
        <p className="field__hint field__hint--error">
          상품명 또는 상품 특징을 입력해 주세요.
        </p>
      )}
    </section>
  )
}

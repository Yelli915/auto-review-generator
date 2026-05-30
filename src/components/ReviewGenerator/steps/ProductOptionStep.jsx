import { useMemo, useState } from 'react'

const PRODUCT_FIELDS = [
  {
    key: 'name',
    label: '상품명',
    placeholder: '예: 세럼, 선크림, 티셔츠',
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
    placeholder: '예: 촉촉함, 향, 용량, 색상, 사용감 등',
  },
]

const MANUAL_ANALYSIS_STATUSES = new Set(['fallback', 'reader'])

function getDefaultSelections(optionGroups) {
  return Array.isArray(optionGroups)
    ? optionGroups.map((group) => group?.options?.[0]?.value || '')
    : []
}

function needsManualProductInfo(analysis) {
  return (
    Boolean(analysis?.needsManualInput) ||
    MANUAL_ANALYSIS_STATUSES.has(analysis?.analysisStatus)
  )
}

function hasConfirmedProductInfo(product) {
  return Boolean(product?.name?.trim()) || Boolean(product?.description?.trim())
}

function hasValidOptionSelections(optionGroups, selections) {
  return (
    optionGroups.length === 0 ||
    optionGroups.every((group, index) => selections[index] && group?.options?.length)
  )
}

function normalizeEditableProduct(product, fallbackUrl = '') {
  const source = product && typeof product === 'object' ? product : {}
  return {
    name: source.name || '',
    brand: source.brand || '',
    imageUrl: source.imageUrl || '',
    price: source.price || '',
    description: source.description || '',
    site: source.site || '',
    url: source.url || fallbackUrl,
  }
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
        <p className="product-info-card__label">자동 인식 결과</p>
        <p className="product-info-card__title">
          {product.name || '상품명을 직접 입력해 주세요'}
        </p>
        <p className="product-info-card__meta">
          {meta || '브랜드와 가격을 확인해 주세요'}
        </p>
      </div>
    </div>
  )
}

function ProductField({ field, value, onChange, disabled }) {
  const inputId = `product-${field.key}`
  return (
    <div className="field">
      <label className="field__label" htmlFor={inputId}>
        {field.label}
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
  const optionGroups = useMemo(
    () => (Array.isArray(analysis?.optionGroups) ? analysis.optionGroups : []),
    [analysis],
  )
  const [product, setProduct] = useState(() => ({
    ...normalizeEditableProduct(analysis?.product, analysis?.url || ''),
  }))
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

  const requiresManualProductInfo = needsManualProductInfo(analysis)
  const hasManualProductInfo = hasConfirmedProductInfo(product)
  const canContinue =
    (!requiresManualProductInfo || hasManualProductInfo) &&
    hasValidOptionSelections(optionGroups, selections)

  const updateProduct = (field, value) => {
    setProduct((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <section className="step-card step-card--enter">
      <h2 className="step-card__title">상품 정보 확인</h2>
      <p className="step-card__lede">
        URL에서 자동 인식한 상품 정보를 확인하고, 부족한 내용은 직접 보완해 주세요.
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

      {analysis?.warning && (
        <div className="product-analysis product-analysis--warning" role="status">
          <p className="product-analysis__label">자동 인식 안내</p>
          <p className="product-analysis__text">{analysis.warning}</p>
        </div>
      )}

      {requiresManualProductInfo && (
        <div className="product-analysis product-analysis--warning" role="status">
          <p className="product-analysis__label">Manual input required</p>
          <p className="product-analysis__text">
            The product page could not be read reliably. Enter the product name
            or product notes below, and keywords will be generated from that
            confirmed information.
          </p>
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
          Enter a product name or product notes to continue.
        </p>
      )}
    </section>
  )
}

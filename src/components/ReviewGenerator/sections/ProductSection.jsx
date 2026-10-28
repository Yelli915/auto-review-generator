import { needsManualProductInfo } from '../utils/productOptions'

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
    key: 'description',
    label: '상품 특징',
    requiredForManual: true,
    placeholder: '예: 조용한 키감, 촉촉한 제형, 넉넉한 수납공간',
  },
]

const ANALYSIS_STATUS_META = {
  ok: { label: '분석 완료', tone: 'ok', message: '상품 페이지에서 주요 정보를 가져왔습니다.' },
  rendered: { label: '분석 완료', tone: 'ok', message: '동적 렌더링 결과에서 상품 정보를 가져왔습니다.' },
  reader: { label: '일부만 읽음', tone: 'warning', message: '상품 페이지 일부만 읽었습니다. 부족한 내용은 직접 보완해 주세요.' },
  fallback: { label: '일부만 읽음', tone: 'warning', message: '상품 페이지 접근이 제한되어 URL에서 추정한 정보만 사용합니다.' },
  failed: { label: '읽지 못함', tone: 'warning', message: '상품 페이지를 자동으로 읽지 못했습니다. 상품명이나 특징을 직접 입력해 주세요.' },
}

export default function ProductSection({
  analysis,
  product,
  onProductChange,
  optionGroups,
  selections,
  onSelectionChange,
  disabled,
  action,
  error,
}) {
  const statusMeta = ANALYSIS_STATUS_META[analysis.analysisStatus] || ANALYSIS_STATUS_META.ok
  const requiresManual = needsManualProductInfo(analysis)
  const meta = [product?.brand, product?.price].filter(Boolean).join(' · ')

  return (
    <section className="panel" aria-labelledby="section-product">
      <h2 className="panel__title" id="section-product">
        <span className="panel__step" aria-hidden="true">2-1</span>
        상품 정보 확인
        <span className={`status-pill status-pill--${statusMeta.tone}`}>{statusMeta.label}</span>
      </h2>
      <p className="panel__lede">{analysis.warning || statusMeta.message}</p>

      <div className="product-info-card">
        {product?.imageUrl && (
          <div className="product-info-card__image">
            <img src={product.imageUrl} alt="" />
          </div>
        )}
        <div className="product-info-card__body">
          <p className="product-info-card__title">
            {product?.name || '상품명을 직접 입력해 주세요'}
          </p>
          {meta && <p className="product-info-card__meta">{meta}</p>}
          <p className="product-info-card__meta product-info-card__url">{analysis.url}</p>
        </div>
      </div>

      {analysis.productContext && (
        <details className="disclosure">
          <summary>자동 수집한 원문 보기</summary>
          <p className="disclosure__body">{analysis.productContext}</p>
        </details>
      )}

      <div className="options-row options-row--2">
        {PRODUCT_FIELDS.map((field) => (
          <div className="field" key={field.key}>
            <label className="field__label" htmlFor={`product-${field.key}`}>
              {field.label}
              {requiresManual && field.requiredForManual && (
                <span className="field__label-note">둘 중 하나 필요</span>
              )}
            </label>
            <input
              id={`product-${field.key}`}
              className="text-input"
              value={product?.[field.key] || ''}
              onChange={(e) => onProductChange(field.key, e.target.value)}
              disabled={disabled}
              placeholder={field.placeholder}
            />
          </div>
        ))}
      </div>

      {optionGroups.length > 0 && (
        <div className="options-row options-row--2">
          {optionGroups.map((group, index) => (
            <div key={`${group.id || group.label || index}`} className="field">
              <label className="field__label" htmlFor={`product-option-${index}`}>
                {group.label || `옵션 ${index + 1}`}
              </label>
              <select
                id={`product-option-${index}`}
                className="select-input"
                value={selections[index] || ''}
                onChange={(e) => onSelectionChange(index, e.target.value)}
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
      )}

      {error && <p className="banner banner--error" role="alert">{error}</p>}
      <button
        type="button"
        className="btn btn--primary btn--lg"
        onClick={action.onClick}
        disabled={action.disabled || disabled}
        aria-busy={action.pending}
      >
        {action.label}
      </button>
      {action.disabled && requiresManual && (
        <p className="field__hint">상품명 또는 상품 특징을 입력하면 키워드를 만들 수 있습니다.</p>
      )}
    </section>
  )
}

import { REVIEW_CATEGORY_OPTIONS } from '../../../../shared/reviewCategories'

export default function CategoryStep({ onSelect }) {
  return (
    <section className="step-card step-card--enter">
      <h2 className="step-card__title">리뷰 분야 선택</h2>
      <p className="step-card__lede">
        작성하려는 리뷰가 장소 후기인지 상품 후기인지 먼저 선택해 주세요.
      </p>

      <div className="category-choice-grid category-choice-grid--landing" role="list">
        {REVIEW_CATEGORY_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="category-choice category-choice--landing"
            onClick={() => onSelect?.(option.value)}
          >
            <span className="category-choice__label">{option.label}</span>
            <span className="category-choice__meta">
              {option.value === 'place'
                ? '공간, 분위기, 방문 경험 중심'
                : '구성, 디자인, 사용감 중심'}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

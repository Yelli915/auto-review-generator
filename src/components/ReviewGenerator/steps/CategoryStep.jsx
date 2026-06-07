import { useState } from 'react'
import { REVIEW_CATEGORY_OPTIONS } from '../../../../shared/reviewCategories'

export default function CategoryStep({ onSelect }) {
  const [selectedCategory, setSelectedCategory] = useState(
    REVIEW_CATEGORY_OPTIONS[0]?.value || 'place',
  )
  const category = REVIEW_CATEGORY_OPTIONS.find(
    (option) => option.value === selectedCategory,
  ) || REVIEW_CATEGORY_OPTIONS[0]

  return (
    <section className="step-card step-card--enter">
      <h2 className="step-card__title">리뷰 분야 선택</h2>
      <p className="step-card__lede">
        작성하려는 리뷰의 큰 분야와 세부 분야를 선택해 주세요.
      </p>

      <div className="category-choice-grid category-choice-grid--landing" role="list">
        {REVIEW_CATEGORY_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`category-choice category-choice--landing${
              selectedCategory === option.value ? ' is-active' : ''
            }`}
            onClick={() => setSelectedCategory(option.value)}
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

      <div className="step-section">
        <p className="step-section__label">세부 분야</p>
        <div className="category-choice-grid" role="list">
          {category.subcategories.map((option) => (
            <button
              key={option.value}
              type="button"
              className="category-choice"
              onClick={() =>
                onSelect?.({
                  category: category.value,
                  subcategory: option.value,
                })
              }
            >
              <span className="category-choice__label">{option.label}</span>
              <span className="category-choice__meta">{option.focus}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

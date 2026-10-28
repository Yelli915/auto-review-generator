import { REVIEW_CATEGORY_OPTIONS } from '#shared/reviewCategories'
import ChoiceGroup from './ChoiceGroup'

export default function CategorySection({
  category,
  subcategory,
  onCategoryChange,
  onSubcategoryChange,
  disabled,
}) {
  const categoryMeta =
    REVIEW_CATEGORY_OPTIONS.find((option) => option.value === category) ||
    REVIEW_CATEGORY_OPTIONS[0]
  const subcategoryMeta = categoryMeta.subcategories.find(
    (option) => option.value === subcategory,
  )

  return (
    <section className="panel" aria-labelledby="section-category">
      <h2 className="panel__title" id="section-category">
        <span className="panel__step" aria-hidden="true">1</span>
        분야
      </h2>
      <ChoiceGroup
        legend="분야"
        options={REVIEW_CATEGORY_OPTIONS}
        value={category}
        onChange={onCategoryChange}
        disabled={disabled}
      />
      <ChoiceGroup
        legend="세부 분야"
        variant="chips"
        options={[{ value: '', label: '고르지 않음' }, ...categoryMeta.subcategories]}
        value={subcategory}
        onChange={onSubcategoryChange}
        disabled={disabled}
        hint={
          subcategoryMeta
            ? `${subcategoryMeta.focus} 중심으로 작성합니다.`
            : '고르면 분야에 맞는 표현을 더 정확하게 사용합니다.'
        }
      />
    </section>
  )
}

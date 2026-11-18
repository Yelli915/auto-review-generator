import { REVIEW_CATEGORY_OPTIONS } from '#shared/reviewCategories'
import ChoiceGroup from './ChoiceGroup'

export default function CategorySection({
  category,
  subcategory,
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
    <div className="category-details">
      <ChoiceGroup
        legend="세부 분야 (선택)"
        variant="chips"
        options={[{ value: '', label: '전체' }, ...categoryMeta.subcategories]}
        value={subcategory}
        onChange={onSubcategoryChange}
        disabled={disabled}
        hint={
          subcategoryMeta
            ? `${subcategoryMeta.label}에서의 경험에 맞는 표현을 추천해요.`
            : '분야를 고르면 더 잘 어울리는 표현을 추천해요.'
        }
      />
    </div>
  )
}

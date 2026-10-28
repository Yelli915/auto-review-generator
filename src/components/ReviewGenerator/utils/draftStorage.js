import { normalizeReviewRating } from '#shared/reviewRating'

const DRAFT_KEY = 'auto-review-generator:draft'
const DRAFT_VERSION = 1

// 새로고침 후에도 입력을 이어 쓰기 위한 탭 단위 임시 저장입니다.
// 이미지는 용량 때문에 저장하지 않고 개수만 남깁니다.
export function sanitizeDraft(raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== DRAFT_VERSION) return null
  const pickString = (value) => (typeof value === 'string' ? value : '')
  const pickStrings = (value) =>
    Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
  const pickObject = (value) => (value && typeof value === 'object' ? value : null)
  const productAnalysis = pickObject(raw.productAnalysis)
  const optionGroups = Array.isArray(productAnalysis?.optionGroups) ? productAnalysis.optionGroups : []
  // 저장된 선택값이 현재 옵션 목록에 없으면 첫 옵션으로 되돌려 <select> 표시와 상태를 맞춥니다.
  const optionSelections = optionGroups.map((group, index) => {
    const values = Array.isArray(group?.options) ? group.options.map((option) => option?.value) : []
    const saved = Array.isArray(raw.optionSelections) ? raw.optionSelections[index] : undefined
    return values.includes(saved) ? saved : values[0] || ''
  })
  return {
    category: pickString(raw.category),
    subcategory: pickString(raw.subcategory),
    inputMode: raw.inputMode === 'link' ? 'link' : 'image',
    productUrl: pickString(raw.productUrl),
    userExperience: pickString(raw.userExperience),
    rating: normalizeReviewRating(raw.rating),
    imageCount: Number(raw.imageCount) || 0,
    productAnalysis,
    product: pickObject(raw.product),
    optionSelections,
    sourceData: pickObject(raw.sourceData),
    keywords: pickStrings(raw.keywords),
    customKeywords: pickStrings(raw.customKeywords),
    selectedKeywords: pickStrings(raw.selectedKeywords),
    keywordsStale: Boolean(raw.keywordsStale),
    length: pickString(raw.length),
    tone: pickString(raw.tone),
    versions: Array.isArray(raw.versions)
      ? raw.versions
          .filter((item) => typeof item?.text === 'string' && Number.isFinite(item.n))
          .map((item) => ({
            ...item,
            note: pickString(item.note),
            keywords: pickStrings(item.keywords),
          }))
      : [],
    activeVersion: Number(raw.activeVersion) || 0,
  }
}

export function loadDraft() {
  try {
    return sanitizeDraft(JSON.parse(sessionStorage.getItem(DRAFT_KEY)))
  } catch {
    return null
  }
}

export function saveDraft(draft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, v: DRAFT_VERSION }))
  } catch {
    // 저장 공간이 없거나 막혀 있어도 앱은 그대로 동작합니다.
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    // ignore
  }
}

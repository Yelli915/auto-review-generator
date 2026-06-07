export function getDefaultOptionSelections(optionGroups) {
  return Array.isArray(optionGroups)
    ? optionGroups.map((group) => group?.options?.[0]?.value || '')
    : []
}

export function normalizeOptionGroups(optionGroups) {
  return Array.isArray(optionGroups) ? optionGroups : []
}

export function mergeOptionSelections(optionGroups, selections) {
  const groups = normalizeOptionGroups(optionGroups)
  const defaults = getDefaultOptionSelections(groups)
  if (!Array.isArray(selections) || !selections.length) return defaults
  return defaults.map((value, index) => {
    const candidate = selections[index]
    return groups[index]?.options?.some((option) => option.value === candidate)
      ? candidate
      : value
  })
}

export function normalizeProductInfo(product, fallbackUrl = '') {
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

export function hasValidOptionSelections(optionGroups, selections) {
  return (
    optionGroups.length === 0 ||
    optionGroups.every((group, index) => selections[index] && group?.options?.length)
  )
}

const MANUAL_ANALYSIS_STATUSES = new Set(['fallback', 'reader', 'failed'])

export function needsManualProductInfo(analysis) {
  return (
    Boolean(analysis?.needsManualInput) ||
    MANUAL_ANALYSIS_STATUSES.has(analysis?.analysisStatus)
  )
}

export function hasConfirmedProductInfo(product) {
  return Boolean(product?.name?.trim()) || Boolean(product?.description?.trim())
}

export function canContinueWithProductInfo({
  analysis,
  optionGroups,
  product,
  selections,
}) {
  const requiresManualProductInfo = needsManualProductInfo(analysis)
  return (
    (!requiresManualProductInfo || hasConfirmedProductInfo(product)) &&
    hasValidOptionSelections(normalizeOptionGroups(optionGroups), selections)
  )
}

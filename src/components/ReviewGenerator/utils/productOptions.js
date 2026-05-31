export function getDefaultOptionSelections(optionGroups) {
  return Array.isArray(optionGroups)
    ? optionGroups.map((group) => group?.options?.[0]?.value || '')
    : []
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

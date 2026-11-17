import { formatProductContext } from '#shared/productContext'

// 작업 공간의 입력을 서버 요청용 근거 텍스트와 상품 분석 상태로 바꾸는 순수 함수들입니다.
export function buildOptionSummary(optionGroups, selections) {
  if (!Array.isArray(optionGroups) || !optionGroups.length) return ''
  return optionGroups
    .map((group, index) => {
      const selectedValue = selections?.[index] || ''
      const selectedOption = Array.isArray(group.options)
        ? group.options.find((option) => option.value === selectedValue)
        : null
      const label = selectedOption?.label || selectedOption?.value || '미선택'
      return `${group.label}: ${label}`
    })
    .join('\n')
}

export function buildEvidenceContext(sourceData) {
  const sourceContext =
    typeof sourceData?.productContext === 'string'
      ? sourceData.productContext.trim()
      : ''
  const userExperience =
    typeof sourceData?.userExperience === 'string'
      ? sourceData.userExperience.trim()
      : ''
  const contextParts = [
    sourceContext && `observedEvidence:\n${sourceContext}`,
    userExperience && `userExperience:\n${userExperience}`,
  ].filter(Boolean)
  return contextParts.join('\n\n')
}

// 서버(buildAnalysisResult)가 형태와 기본값을 맞춰 보내므로, 입력 칸에 바로 묶이는 product만 빈 값을 채웁니다.
export function normalizeProductAnalysis(analysis, fallbackUrl) {
  const url = analysis.url || fallbackUrl
  return { ...analysis, url, product: normalizeProductInfo(analysis.product, url) }
}

export function createManualProductAnalysis(productUrl, error) {
  return {
    url: productUrl,
    product: normalizeProductInfo({ url: productUrl }, productUrl),
    productContext: '',
    optionGroups: [],
    analysisStatus: 'failed',
    warning:
      error ||
      '상품 페이지를 자동으로 읽지 못했습니다. 상품명이나 특징을 직접 입력해 주세요.',
    needsManualInput: true,
  }
}

export function appendProductContext(sourceData, product, selectionSummary) {
  const productInfoContext = formatProductContext(product)
  const baseContext = productInfoContext
    ? `확인된 상품 정보:\n${productInfoContext}`
    : sourceData.productContext
  const contextParts = [
    baseContext,
    selectionSummary && `선택 옵션:\n${selectionSummary}`,
  ].filter(Boolean)
  if (!contextParts.length) return sourceData
  return {
    ...sourceData,
    productContext: contextParts.join('\n\n'),
  }
}

// -- 상품 옵션·직접 입력 확인 --

export function getDefaultOptionSelections(optionGroups) {
  return Array.isArray(optionGroups)
    ? optionGroups.map((group) => group?.options?.[0]?.value || '')
    : []
}

export function normalizeOptionGroups(optionGroups) {
  return Array.isArray(optionGroups) ? optionGroups : []
}

function normalizeProductInfo(product, fallbackUrl = '') {
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

function hasValidOptionSelections(optionGroups, selections) {
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

// -- 키워드 선택: 이전 상태(keywords·customKeywords·selectedKeywords)를 받아 바꿀 필드만 돌려줍니다. --

// 이어서 고를 선택이 남아 있지 않으면(처음 만들 때 등) 전부 골라 둬서 바로 리뷰를 만들 수 있게 합니다.
export function withNewKeywords(prev, nextKeywords) {
  const kept = prev.selectedKeywords.filter(
    (k) => nextKeywords.includes(k) || prev.customKeywords.includes(k),
  )
  return {
    keywords: nextKeywords,
    selectedKeywords: kept.length ? kept : [...new Set([...nextKeywords, ...prev.customKeywords])],
  }
}

export function withToggledKeyword(prev, keyword) {
  const selected = prev.selectedKeywords
  return {
    selectedKeywords: selected.includes(keyword)
      ? selected.filter((k) => k !== keyword)
      : [...selected, keyword],
  }
}

export function withAllKeywordsToggled(prev) {
  const all = [...new Set([...prev.keywords, ...prev.customKeywords])]
  return { selectedKeywords: prev.selectedKeywords.length === all.length ? [] : all }
}

export function withCustomKeyword(prev, keyword) {
  return {
    customKeywords: [...prev.customKeywords, keyword],
    selectedKeywords: [...new Set([...prev.selectedKeywords, keyword])],
  }
}

export function withoutCustomKeyword(prev, keyword) {
  return {
    customKeywords: prev.customKeywords.filter((k) => k !== keyword),
    selectedKeywords: prev.selectedKeywords.filter((k) => k !== keyword),
  }
}

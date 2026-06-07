import { useState } from 'react'
import {
  DEFAULT_REVIEW_CATEGORY,
  DEFAULT_REVIEW_SUBCATEGORY,
  normalizeReviewCategory,
  normalizeReviewSubcategory,
} from '../../../../shared/reviewCategories'
import {
  DEFAULT_REVIEW_LENGTH,
  DEFAULT_REVIEW_TONE,
} from '../../../../shared/reviewOptions'
import { normalizeReviewRating } from '../../../../shared/reviewRating'
import {
  analyzeProductUrl,
  generateKeywords,
  generateReview,
} from '../api/geminiService'
import {
  getDefaultOptionSelections as getDefaultSelections,
  normalizeProductInfo,
} from '../utils/productOptions'

export const STEPS = {
  CATEGORY: 'category',
  UPLOAD: 'upload',
  PRODUCT_OPTIONS: 'product-options',
  KEYWORD: 'keyword',
  REVIEW: 'review',
}

export const STEP_ORDER = [
  STEPS.CATEGORY,
  STEPS.UPLOAD,
  STEPS.PRODUCT_OPTIONS,
  STEPS.KEYWORD,
  STEPS.REVIEW,
]

async function loadKeywordsFromSource(sourcePayload, previousKeywords = []) {
  const result = await generateKeywords({
    images: sourcePayload.images,
    productUrl: sourcePayload.productUrl,
    productContext: buildEvidenceContext(sourcePayload),
    rating: sourcePayload.rating,
    category: sourcePayload.category,
    subcategory: sourcePayload.subcategory,
    previousKeywords,
  })
  if (!result?.ok) {
    throw new Error(result?.error || '키워드 생성에 실패했습니다.')
  }
  return Array.isArray(result.keywords) ? result.keywords : []
}

function buildOptionSummary(optionGroups, selections) {
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

function normalizeSourceData(data, fallbackCategory) {
  const category = normalizeReviewCategory(data?.category ?? fallbackCategory)
  return {
    images: Array.isArray(data?.images) ? data.images : [],
    productUrl: typeof data?.productUrl === 'string' ? data.productUrl.trim() : '',
    productContext:
      typeof data?.productContext === 'string' ? data.productContext.trim() : '',
    userExperience:
      typeof data?.userExperience === 'string' ? data.userExperience.trim() : '',
    rating: normalizeReviewRating(data?.rating),
    category,
    subcategory: normalizeReviewSubcategory(category, data?.subcategory),
  }
}

function buildEvidenceContext(sourceData) {
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

function normalizeProductAnalysis(analysis, fallbackUrl) {
  const url = analysis.url || fallbackUrl
  return {
    url,
    product: normalizeProductInfo(analysis.product, url),
    productContext: analysis.productContext || '',
    optionGroups: Array.isArray(analysis.optionGroups) ? analysis.optionGroups : [],
    analysisStatus: analysis.analysisStatus || 'ok',
    warning: analysis.warning || '',
    needsManualInput: Boolean(analysis.needsManualInput),
  }
}

function createManualProductAnalysis(productUrl, error) {
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

function buildProductInfoContext(product) {
  if (!product || typeof product !== 'object') return ''
  return [
    product.name && `상품명: ${product.name}`,
    product.brand && `브랜드: ${product.brand}`,
    product.price && `가격 정보: ${product.price}`,
    product.description && `설명: ${product.description}`,
    product.url && `링크: ${product.url}`,
  ]
    .filter(Boolean)
    .join('\n')
}

function appendProductContext(sourceData, product, selectionSummary) {
  const productInfoContext = buildProductInfoContext(product)
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

export function useReviewGeneratorFlow({ onReviewComplete } = {}) {
  const [step, setStep] = useState(STEPS.CATEGORY)
  const [reviewCategory, setReviewCategory] = useState(DEFAULT_REVIEW_CATEGORY)
  const [reviewSubcategory, setReviewSubcategory] = useState(
    DEFAULT_REVIEW_SUBCATEGORY,
  )
  const [sourceData, setSourceData] = useState(null)
  const [productAnalysis, setProductAnalysis] = useState(null)
  const [productOptionSelections, setProductOptionSelections] = useState([])
  const [keywords, setKeywords] = useState([])
  const [review, setReview] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState(null)
  const [lastUsedOptions, setLastUsedOptions] = useState(null)

  const clearProductState = () => {
    setProductAnalysis(null)
    setProductOptionSelections([])
  }

  const clearGeneratedState = () => {
    clearProductState()
    setKeywords([])
    setReview('')
    setError(null)
    setLastUsedOptions(null)
  }

  const runLoadingTask = async (task, fallbackMessage) => {
    setError(null)
    setIsLoading(true)
    try {
      await task()
    } catch (e) {
      setError(e instanceof Error ? e.message : fallbackMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const loadKeywordsAndAdvance = async (nextSource) => {
    const nextKeywords = await loadKeywordsFromSource(nextSource)
    setKeywords(nextKeywords)
    setStep(STEPS.KEYWORD)
  }

  const continueAfterProductOptions = async (
    baseSource,
    analysis = productAnalysis,
  ) => {
    const optionGroups = Array.isArray(analysis?.optionGroups)
      ? analysis.optionGroups
      : []

    setSourceData(baseSource)

    if (analysis?.url) {
      setProductOptionSelections(getDefaultSelections(optionGroups))
      setStep(STEPS.PRODUCT_OPTIONS)
      return
    }

    await loadKeywordsAndAdvance(baseSource)
  }

  const handleCategorySelect = (selection) => {
    const nextCategory = normalizeReviewCategory(
      typeof selection === 'object' ? selection?.category : selection,
    )
    const nextSubcategory = normalizeReviewSubcategory(
      nextCategory,
      typeof selection === 'object' ? selection?.subcategory : '',
    )
    setReviewCategory(nextCategory)
    setReviewSubcategory(nextSubcategory)
    setSourceData(null)
    clearGeneratedState()
    setStep(STEPS.UPLOAD)
  }

  const handleBackToCategory = () => {
    setStep(STEPS.CATEGORY)
  }

  const handleUploadNext = async (data) => {
    const normalizedData = normalizeSourceData(data, reviewCategory)

    await runLoadingTask(async () => {
      if (normalizedData.productUrl) {
        const analysis = await analyzeProductUrl(normalizedData.productUrl)
        const nextAnalysis = analysis?.ok
          ? normalizeProductAnalysis(analysis, normalizedData.productUrl)
          : createManualProductAnalysis(
              normalizedData.productUrl,
              analysis?.error,
            )
        const nextSource = {
          ...normalizedData,
          productUrl: nextAnalysis.url,
          productContext: nextAnalysis.productContext,
        }

        setProductAnalysis(nextAnalysis)
        await continueAfterProductOptions(nextSource, nextAnalysis)
        return
      }

      clearProductState()
      await continueAfterProductOptions(normalizedData, null)
    }, '키워드 생성에 실패했습니다.')
  }

  const handleProductOptionNext = async (selectedSelections, confirmedProduct) => {
    if (!productAnalysis || !sourceData?.productUrl) return
    const optionGroups = Array.isArray(productAnalysis.optionGroups)
      ? productAnalysis.optionGroups
      : []
    const safeSelections = Array.isArray(selectedSelections)
      ? selectedSelections
      : getDefaultSelections(optionGroups)
    const selectionSummary = buildOptionSummary(optionGroups, safeSelections)
    const nextSource = appendProductContext(
      sourceData,
      confirmedProduct || productAnalysis.product,
      selectionSummary,
    )

    await runLoadingTask(async () => {
      setProductOptionSelections(safeSelections)
      setSourceData(nextSource)
      await loadKeywordsAndAdvance(nextSource)
    }, '키워드 생성에 실패했습니다.')
  }

  const handleRefresh = async () => {
    if (!sourceData || isLoading) return
    await runLoadingTask(async () => {
      const nextKeywords = await loadKeywordsFromSource(sourceData, keywords)
      setKeywords(nextKeywords)
    }, '키워드 재생성에 실패했습니다.')
  }

  const handleBackToUpload = () => {
    setStep(STEPS.UPLOAD)
    setKeywords([])
    setReview('')
    setLastUsedOptions(null)
    clearProductState()
    setError(null)
  }

  const handleResetToStart = () => {
    setStep(STEPS.CATEGORY)
    setReviewCategory(DEFAULT_REVIEW_CATEGORY)
    setReviewSubcategory(DEFAULT_REVIEW_SUBCATEGORY)
    setSourceData(null)
    clearGeneratedState()
    setIsLoading(false)
    setIsStreaming(false)
  }

  const handleKeywordNext = async (
    selectedKeywords,
    reviewLength = DEFAULT_REVIEW_LENGTH,
    reviewTone = DEFAULT_REVIEW_TONE,
    rewriteInstruction = '',
  ) => {
    if (!sourceData) return
    const previousReview = rewriteInstruction ? review.trim() : ''
    setLastUsedOptions({ keywords: selectedKeywords, length: reviewLength, tone: reviewTone })
    setReview('')
    setError(null)
    setStep(STEPS.REVIEW)
    setIsStreaming(true)

    let fullReview = ''
    let isSuccess = false
    try {
      await generateReview({
        rating: sourceData.rating,
        keywords: selectedKeywords,
        length: reviewLength,
        tone: reviewTone,
        category: sourceData.category,
        subcategory: sourceData.subcategory,
        productContext: buildEvidenceContext(sourceData),
        previousReview,
        rewriteInstruction,
        onChunk: (chunk) => {
          fullReview = chunk
          setReview(fullReview)
        },
      })
      isSuccess = true
    } catch (e) {
      setError(e instanceof Error ? e.message : '리뷰 생성에 실패했습니다.')
      setStep(STEPS.KEYWORD)
    } finally {
      setIsStreaming(false)
      if (isSuccess) {
        onReviewComplete?.(fullReview)
      }
    }
  }

  const handleRegenerate = (rewriteInstruction = '') => {
    if (!lastUsedOptions) return
    handleKeywordNext(
      lastUsedOptions.keywords,
      lastUsedOptions.length,
      lastUsedOptions.tone,
      rewriteInstruction,
    )
  }

  return {
    step,
    reviewCategory,
    reviewSubcategory,
    productAnalysis,
    productOptionSelections,
    keywords,
    review,
    isLoading,
    isStreaming,
    error,
    lastUsedOptions,
    handleBackToCategory,
    handleBackToUpload,
    handleCategorySelect,
    handleKeywordNext,
    handleProductOptionNext,
    handleRefresh,
    handleRegenerate,
    handleResetToStart,
    handleUploadNext,
  }
}

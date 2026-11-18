import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DEFAULT_REVIEW_CATEGORY,
  normalizeReviewCategory,
  normalizeReviewSubcategory,
} from '#shared/reviewCategories'
import {
  normalizeReviewLength,
  normalizeReviewRating,
  normalizeReviewTone,
} from '#shared/reviewOptions'
import {
  analyzeProductUrl,
  generateKeywords,
} from '../services/geminiService'
import { loadDraft } from '../utils/draftStorage'
import {
  appendProductContext,
  buildEvidenceContext,
  buildOptionSummary,
  canContinueWithProductInfo,
  createManualProductAnalysis,
  getDefaultOptionSelections,
  normalizeOptionGroups,
  normalizeProductAnalysis,
  withAllKeywordsToggled,
  withCustomKeyword,
  withNewKeywords,
  withoutCustomKeyword,
  withToggledKeyword,
} from '../utils/workspaceContext'
import { useReviewVersions } from './useReviewVersions'
import { useUploadImages } from './useUploadImages'
import { useDraftPersistence } from './useDraftPersistence'
import { useReviewGeneration } from './useReviewGeneration'

async function loadKeywordsFromSource(sourcePayload, previousKeywords = []) {
  const result = await generateKeywords({
    images: sourcePayload.images,
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

function scrollIntoViewSoon(ref) {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  requestAnimationFrame(() => {
    ref.current?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'nearest',
    })
  })
}

function createInitialState(draft) {
  const category = normalizeReviewCategory(draft?.category || DEFAULT_REVIEW_CATEGORY)
  return {
    category,
    subcategory: normalizeReviewSubcategory(category, draft?.subcategory),
    inputMode: draft?.inputMode || (category === 'product' ? 'link' : 'image'),
    productUrl: draft?.productUrl || '',
    userExperience: draft?.userExperience || '',
    rating: draft?.rating ?? 5,
    productAnalysis: draft?.productAnalysis || null,
    product: draft?.product || null,
    optionSelections: draft?.optionSelections || [],
    sourceData: draft?.sourceData || null,
    keywords: draft?.keywords || [],
    customKeywords: draft?.customKeywords || [],
    selectedKeywords: draft?.selectedKeywords || [],
    keywordsStale: Boolean(draft?.keywordsStale),
    length: normalizeReviewLength(draft?.length),
    tone: normalizeReviewTone(draft?.tone),
  }
}

// 한 화면 작업 공간의 상태입니다. 입력(분야·재료·상품 정보) → 키워드 → 리뷰 버전 순으로
// 데이터가 흐르고, 입력이 바뀌면 화면을 되돌리는 대신 키워드를 "이전 입력 기준"으로 표시합니다.
export function useReviewWorkspace({ pasteEnabled = true }) {
  const [draft] = useState(loadDraft)
  // 초안으로 저장되는 입력·키워드 상태를 한 객체로 둡니다. 필드를 추가하면 createInitialState와 sanitizeDraft만 고칩니다.
  const [state, setState] = useState(() => createInitialState(draft))
  // patch: 바꿀 필드 객체, 또는 이전 상태를 받아 그 객체를 돌려주는 함수
  const update = useCallback(
    (patch) => setState((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) })),
    [],
  )
  const {
    category, subcategory, inputMode, productUrl, userExperience, rating,
    productAnalysis, product, optionSelections, sourceData,
    keywords, customKeywords, selectedKeywords, keywordsStale, length, tone,
  } = state
  const versionState = useReviewVersions(draft)
  const { versions, activeVersion, setActiveVersion, editActiveVersion } = versionState
  const [missingImageCount, setMissingImageCount] = useState(() =>
    draft?.inputMode === 'link' ? 0 : draft?.imageCount || 0,
  )
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const keywordSectionRef = useRef(null)
  const resultRef = useRef(null)

  const canUseLink = category === 'product'
  const isLinkMode = canUseLink && inputMode === 'link'
  const optionGroups = normalizeOptionGroups(productAnalysis?.optionGroups)
  // 분석 뒤 링크를 고쳐도 직접 보완한 상품 정보는 지우지 않고, 다시 분석할지 사용자가 고르게 합니다.
  // inputUrl이 없는 예전 초안은 서버가 돌려준 url과 비교합니다.
  const productUrlChanged = Boolean(productAnalysis) &&
    productUrl.trim() !== (productAnalysis.inputUrl ?? productAnalysis.url)

  // 입력 근거가 바뀌면 이미 만든 키워드를 "이전 입력 기준"으로 표시합니다.
  const updateSource = useCallback(
    (patch) =>
      update((prev) => ({
        ...(typeof patch === 'function' ? patch(prev) : patch),
        keywordsStale: prev.keywordsStale || prev.keywords.length > 0,
      })),
    [update],
  )

  // 붙여넣기 리스너가 렌더마다 다시 붙지 않도록 함수 참조를 고정합니다.
  const switchToImageMode = useCallback(() => update({ inputMode: 'image' }), [update])
  const upload = useUploadImages({
    isLoading: Boolean(busy),
    isLinkMode,
    pasteEnabled,
    switchToImageMode,
  })

  const prevImagesRef = useRef(upload.images)
  useEffect(() => {
    if (prevImagesRef.current === upload.images) return
    prevImagesRef.current = upload.images
    if (upload.images.length) setMissingImageCount(0)
    updateSource({})
  }, [upload.images, updateSource])

  useDraftPersistence({
    state,
    versions,
    activeVersion,
    imageCount: upload.images.length || missingImageCount,
    isGenerating: busy === 'review',
  })

  const runTask = async (scope, task, fallbackMessage, onStart) => {
    if (busy) return
    onStart?.()
    setError(null)
    setBusy(scope)
    try {
      return await task()
    } catch (e) {
      setError({ scope, message: e instanceof Error ? e.message : fallbackMessage })
    } finally {
      setBusy(null)
    }
  }

  const setCategory = (value) => {
    const next = normalizeReviewCategory(value)
    if (next === category) return
    updateSource({
      category: next,
      subcategory: normalizeReviewSubcategory(next, ''),
      inputMode: next === 'product' ? 'link' : 'image',
    })
  }

  const setSubcategory = (value) =>
    updateSource({ subcategory: normalizeReviewSubcategory(category, value) })
  const setInputMode = (value) => updateSource({ inputMode: value === 'link' ? 'link' : 'image' })
  const setProductUrl = (value) => updateSource({ productUrl: value })
  const setUserExperience = (value) => updateSource({ userExperience: value })
  const setRating = (value) => updateSource({ rating: normalizeReviewRating(value) })
  const updateProduct = (field, value) =>
    updateSource((prev) => ({ product: { ...prev.product, [field]: value } }))

  const setOptionSelection = (index, value) => {
    updateSource((prev) => {
      const next = [...prev.optionSelections]
      next[index] = value
      return { optionSelections: next }
    })
  }

  const analyzeProduct = () =>
    runTask('analyze', async () => {
      const url = productUrl.trim()
      const result = await analyzeProductUrl(url)
      // 출처 거부·요청 과다·저장소 오류는 페이지 문제가 아니므로 직접 입력으로 넘기지 않습니다.
      if ([403, 429, 503].includes(result?.status)) throw new Error(result.error)
      const analysis = result?.ok
        ? normalizeProductAnalysis(result, url)
        : createManualProductAnalysis(url, result?.error)
      updateSource({
        productAnalysis: { ...analysis, inputUrl: url },
        product: analysis.product,
        optionSelections: getDefaultOptionSelections(analysis.optionGroups),
      })
    }, '상품 정보를 분석하지 못했습니다.')

  const buildKeywordSource = () => {
    const base = {
      images: isLinkMode ? [] : upload.images,
      productContext: '',
      userExperience: userExperience.trim(),
      rating,
      category,
      subcategory,
    }
    if (!isLinkMode || !productAnalysis) return base
    return appendProductContext(
      {
        ...base,
        productContext: productAnalysis.productContext,
      },
      product,
      buildOptionSummary(optionGroups, optionSelections),
    )
  }

  const isProductInfoReady = Boolean(productAnalysis) && canContinueWithProductInfo({
    analysis: productAnalysis,
    optionGroups,
    product,
    selections: optionSelections,
  })
  const canBuildKeywords = isLinkMode
    ? isProductInfoReady && !productUrlChanged
    : upload.images.length > 0 && !upload.isProcessing

  // 추천 다시 받기(avoidPrevious)는 키워드 칸에서 누르므로 별도 scope로 오류 위치를 나눕니다.
  const buildKeywords = async ({ avoidPrevious = false } = {}) => {
    if (!canBuildKeywords) return false
    return runTask(avoidPrevious ? 'refresh' : 'keywords', async () => {
      const source = buildKeywordSource()
      const nextKeywords = await loadKeywordsFromSource(
        source,
        avoidPrevious ? keywords : [],
      )
      // 리뷰 생성에는 이미지가 필요 없어서, 저장 용량을 위해 이미지 없이 보관합니다.
      update((prev) => ({
        ...withNewKeywords(prev, nextKeywords),
        sourceData: { ...source, images: [] },
        keywordsStale: false,
      }))
      // 키워드를 새로 만들었으면 복원 초안의 "사진 N장" 안내는 더 이상 맞지 않습니다.
      setMissingImageCount(0)
      scrollIntoViewSoon(keywordSectionRef)
      return true
    }, '키워드 생성에 실패했습니다.')
  }

  const toggleKeyword = (keyword) => update((prev) => withToggledKeyword(prev, keyword))
  const toggleAllKeywords = () => update(withAllKeywordsToggled)
  const addCustomKeyword = (keyword) => update((prev) => withCustomKeyword(prev, keyword))
  const removeCustomKeyword = (keyword) => update((prev) => withoutCustomKeyword(prev, keyword))

  const canGenerateReview = Boolean(sourceData) && selectedKeywords.length > 0

  const { writeReview, reviewsRemaining } = useReviewGeneration({
    input: state,
    versionState,
    runTask,
    onVersionOpened: () => scrollIntoViewSoon(resultRef),
  })

  return {
    busy,
    error,
    keywordSectionRef,
    resultRef,
    // 입력
    category,
    subcategory,
    setCategory,
    setSubcategory,
    canUseLink,
    isLinkMode,
    setInputMode,
    productUrl,
    setProductUrl,
    userExperience,
    setUserExperience,
    rating,
    setRating,
    upload,
    missingImageCount,
    // 상품
    productAnalysis,
    product,
    updateProduct,
    optionGroups,
    optionSelections,
    setOptionSelection,
    analyzeProduct,
    productUrlChanged,
    isProductInfoReady,
    // 키워드
    canBuildKeywords,
    buildKeywords,
    hasSource: Boolean(sourceData),
    keywords,
    customKeywords,
    selectedKeywords,
    keywordsStale,
    toggleKeyword,
    toggleAllKeywords,
    addCustomKeyword,
    removeCustomKeyword,
    length,
    setLength: (value) => update({ length: value }),
    tone,
    setTone: (value) => update({ tone: value }),
    // 리뷰
    canGenerateReview,
    writeReview,
    versions,
    activeVersion,
    setActiveVersion,
    editActiveVersion,
    reviewsRemaining,
  }
}

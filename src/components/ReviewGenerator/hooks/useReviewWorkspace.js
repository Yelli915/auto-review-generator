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
  generateReview,
  getGoogleAccountId,
  hasGoogleIdToken,
} from '../services/geminiService'
import { loadDraft, loadReviewUsage, saveDraft, saveReviewUsage } from '../utils/draftStorage'
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

const SAVE_DELAY_MS = 500

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
export function useReviewWorkspace({ requestLogin, pasteEnabled = true }) {
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
  const {
    versions,
    activeVersion,
    setActiveVersion,
    openVersion,
    setLatestText,
    editActiveVersion,
  } = useReviewVersions(draft)
  const [missingImageCount, setMissingImageCount] = useState(() =>
    draft?.inputMode === 'link' ? 0 : draft?.imageCount || 0,
  )
  const [reviewUsage, setReviewUsage] = useState(loadReviewUsage)
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

  // 입력할 때마다 전체를 직렬화하지 않도록 잠깐 모았다가 저장하고, 페이지를 떠날 때 남은 변경을 바로 씁니다.
  const pendingDraftRef = useRef(null)
  useEffect(() => {
    if (busy === 'review') return
    pendingDraftRef.current = {
      ...state,
      imageCount: upload.images.length || missingImageCount,
      versions,
      activeVersion,
    }
    const timer = setTimeout(() => {
      saveDraft(pendingDraftRef.current)
      pendingDraftRef.current = null
    }, SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [busy, state, upload.images.length, missingImageCount, versions, activeVersion])

  useEffect(() => {
    const flush = () => {
      if (pendingDraftRef.current) saveDraft(pendingDraftRef.current)
      pendingDraftRef.current = null
    }
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [])

  const runTask = async (scope, task, fallbackMessage, onStart) => {
    if (busy) return
    if (!hasGoogleIdToken()) {
      if (!requestLogin) {
        setError({ scope, message: '로그인 설정(VITE_GOOGLE_CLIENT_ID)이 없어 이 기능을 쓸 수 없습니다.' })
        return
      }
      if (!(await requestLogin())) return
    }
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
      if (!result?.ok && result?.status === 401) throw new Error(result.error)
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

  const canBuildKeywords = isLinkMode
    ? Boolean(productAnalysis) &&
      canContinueWithProductInfo({
        analysis: productAnalysis,
        optionGroups,
        product,
        selections: optionSelections,
      })
    : upload.images.length > 0 && !upload.isProcessing

  // 추천 다시 받기(avoidPrevious)는 키워드 칸에서 누르므로 별도 scope로 오류 위치를 나눕니다.
  const buildKeywords = ({ avoidPrevious = false } = {}) =>
    runTask(avoidPrevious ? 'refresh' : 'keywords', async () => {
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
    }, '키워드 생성에 실패했습니다.')

  const toggleKeyword = (keyword) => update((prev) => withToggledKeyword(prev, keyword))
  const toggleAllKeywords = () => update(withAllKeywordsToggled)
  const addCustomKeyword = (keyword) => update((prev) => withCustomKeyword(prev, keyword))
  const removeCustomKeyword = (keyword) => update((prev) => withoutCustomKeyword(prev, keyword))

  const canGenerateReview = Boolean(sourceData) && selectedKeywords.length > 0

  // 한도가 초기화되는 시각에 지워서, 페이지를 열어 둔 채 날이 바뀌어도 어제 횟수가 남지 않게 합니다.
  useEffect(() => {
    if (!reviewUsage) return
    const timer = setTimeout(() => setReviewUsage(null), Math.max(0, reviewUsage.resetAt - Date.now()))
    return () => clearTimeout(timer)
  }, [reviewUsage])
  // 다른 계정의 기록이면 보여 주지 않습니다.
  const reviewsRemaining =
    reviewUsage?.account === getGoogleAccountId() ? reviewUsage.remaining : null

  // 실제로 생성해 성공했을 때만 true를 돌려줍니다. onStart: 로그인 확인 뒤 실제로 생성을 시작할 때 호출됩니다(모바일에서 초안 화면으로 넘기는 용도).
  const writeReview = (rewriteAction = null, onStart) =>
    runTask('review', async () => {
      if (!sourceData) return false
      const base = versions[activeVersion]
      const previousReview = rewriteAction ? base?.text.trim() || '' : ''
      // 다듬기는 보고 있는 버전의 키워드·길이·말투를 그대로 써서, 빠진 키워드 표시·최소 글자수가 원본과 같은 기준을 갖게 합니다.
      const basis = rewriteAction && base?.keywords?.length
        ? { keywords: base.keywords, length: base.length || length, tone: base.tone || tone }
        : { keywords: selectedKeywords, length, tone }
      // 별점·경험은 키워드를 다시 만들지 않아도 지금 입력값을 씁니다. 키워드 근거(상품·사진 정보)만 sourceData 기준입니다.
      const productContext = buildEvidenceContext({ ...sourceData, userExperience: userExperience.trim() })
      const rollback = openVersion({
        // 초안 화면이 리뷰에 근거 없는 숫자·영문이 들어갔는지 검사할 때 씁니다. 별점도 프롬프트에 들어가는 근거입니다.
        evidence: `${productContext}\n별점: ${rating}점`,
        note: rewriteAction?.label || '',
        // 다듬은 버전은 비교할 원본 버전 번호를 남깁니다.
        from: rewriteAction ? base?.n : undefined,
        ...basis,
      })
      scrollIntoViewSoon(resultRef)

      let isSuccess = false
      try {
        await generateReview({
          rating,
          ...basis,
          category: sourceData.category,
          subcategory: sourceData.subcategory,
          productContext,
          previousReview,
          rewriteInstruction: rewriteAction?.instruction || '',
          onChunk: setLatestText,
          onUsage: (usage) => {
            const next = { ...usage, account: getGoogleAccountId() }
            setReviewUsage(next)
            saveReviewUsage(next)
          },
        })
        isSuccess = true
      } finally {
        if (!isSuccess) rollback()
      }
      return true
    }, '리뷰 생성에 실패했습니다.', onStart)

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

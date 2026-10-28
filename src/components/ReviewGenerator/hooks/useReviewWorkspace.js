import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DEFAULT_REVIEW_CATEGORY,
  normalizeReviewCategory,
  normalizeReviewSubcategory,
} from '#shared/reviewCategories'
import {
  normalizeReviewLength,
  normalizeReviewTone,
} from '#shared/reviewOptions'
import { normalizeReviewRating } from '#shared/reviewRating'
import {
  analyzeProductUrl,
  generateKeywords,
  generateReview,
  hasGoogleIdToken,
} from '../services/geminiService'
import { loadDraft, saveDraft } from '../utils/draftStorage'
import {
  canContinueWithProductInfo,
  getDefaultOptionSelections,
  normalizeOptionGroups,
} from '../utils/productOptions'
import {
  appendProductContext,
  buildEvidenceContext,
  buildOptionSummary,
  createManualProductAnalysis,
  normalizeProductAnalysis,
} from '../utils/workspaceContext'
import { useUploadImages } from './useUploadImages'

const MAX_VERSIONS = 10
const SAVE_DELAY_MS = 500

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

function scrollIntoViewSoon(ref) {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  requestAnimationFrame(() => {
    ref.current?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'nearest',
    })
  })
}

// 한 화면 작업 공간의 상태입니다. 입력(분야·재료·상품 정보) → 키워드 → 리뷰 버전 순으로
// 데이터가 흐르고, 입력이 바뀌면 화면을 되돌리는 대신 키워드를 "이전 입력 기준"으로 표시합니다.
export function useReviewWorkspace({ requestLogin }) {
  const [draft] = useState(loadDraft)
  const [category, setCategoryState] = useState(() =>
    normalizeReviewCategory(draft?.category || DEFAULT_REVIEW_CATEGORY),
  )
  const [subcategory, setSubcategoryState] = useState(() =>
    normalizeReviewSubcategory(category, draft?.subcategory),
  )
  const [inputMode, setInputModeState] = useState(
    () => draft?.inputMode || (category === 'product' ? 'link' : 'image'),
  )
  const [productUrl, setProductUrlState] = useState(draft?.productUrl || '')
  const [userExperience, setUserExperienceState] = useState(draft?.userExperience || '')
  const [rating, setRatingState] = useState(draft?.rating ?? 5)
  const [productAnalysis, setProductAnalysis] = useState(draft?.productAnalysis || null)
  const [product, setProduct] = useState(draft?.product || null)
  const [optionSelections, setOptionSelections] = useState(draft?.optionSelections || [])
  const [sourceData, setSourceData] = useState(draft?.sourceData || null)
  const [keywords, setKeywords] = useState(draft?.keywords || [])
  const [customKeywords, setCustomKeywords] = useState(draft?.customKeywords || [])
  const [selectedKeywords, setSelectedKeywords] = useState(draft?.selectedKeywords || [])
  const [keywordsStale, setKeywordsStale] = useState(Boolean(draft?.keywordsStale))
  const [length, setLength] = useState(() => normalizeReviewLength(draft?.length))
  const [tone, setTone] = useState(() => normalizeReviewTone(draft?.tone))
  const [versions, setVersions] = useState(draft?.versions || [])
  const [activeVersion, setActiveVersion] = useState(() =>
    Math.min(draft?.activeVersion || 0, Math.max(0, (draft?.versions?.length || 1) - 1)),
  )
  const [missingImageCount, setMissingImageCount] = useState(() =>
    draft?.inputMode === 'link' ? 0 : draft?.imageCount || 0,
  )
  const [reviewsRemaining, setReviewsRemaining] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const keywordSectionRef = useRef(null)
  const resultRef = useRef(null)

  const canUseLink = category === 'product'
  const isLinkMode = canUseLink && inputMode === 'link'
  const optionGroups = normalizeOptionGroups(productAnalysis?.optionGroups)

  const markSourceChanged = () => {
    if (keywords.length) setKeywordsStale(true)
  }

  // 붙여넣기 리스너가 렌더마다 다시 붙지 않도록 함수 참조를 고정합니다.
  const switchToImageMode = useCallback(() => setInputModeState('image'), [])
  const upload = useUploadImages({
    isLoading: Boolean(busy),
    isLinkMode,
    switchToImageMode,
  })

  const prevImagesRef = useRef(upload.images)
  useEffect(() => {
    if (prevImagesRef.current === upload.images) return
    prevImagesRef.current = upload.images
    if (upload.images.length) setMissingImageCount(0)
    if (keywords.length) setKeywordsStale(true)
  }, [upload.images, keywords.length])

  // 입력할 때마다 전체를 직렬화하지 않도록 잠깐 모았다가 저장하고, 페이지를 떠날 때 남은 변경을 바로 씁니다.
  const pendingDraftRef = useRef(null)
  useEffect(() => {
    if (busy === 'review') return
    pendingDraftRef.current = {
      category,
      subcategory,
      inputMode,
      productUrl,
      userExperience,
      rating,
      imageCount: upload.images.length || missingImageCount,
      productAnalysis,
      product,
      optionSelections,
      sourceData,
      keywords,
      customKeywords,
      selectedKeywords,
      keywordsStale,
      length,
      tone,
      versions,
      activeVersion,
    }
    const timer = setTimeout(() => {
      saveDraft(pendingDraftRef.current)
      pendingDraftRef.current = null
    }, SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [
    busy, category, subcategory, inputMode, productUrl, userExperience, rating,
    upload.images.length, missingImageCount, productAnalysis, product,
    optionSelections, sourceData, keywords, customKeywords, selectedKeywords,
    keywordsStale, length, tone, versions, activeVersion,
  ])

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
      await task()
    } catch (e) {
      setError({ scope, message: e instanceof Error ? e.message : fallbackMessage })
    } finally {
      setBusy(null)
    }
  }

  const setCategory = (value) => {
    const next = normalizeReviewCategory(value)
    if (next === category) return
    setCategoryState(next)
    setSubcategoryState(normalizeReviewSubcategory(next, ''))
    setInputModeState(next === 'product' ? 'link' : 'image')
    markSourceChanged()
  }

  const setSubcategory = (value) => {
    setSubcategoryState(normalizeReviewSubcategory(category, value))
    markSourceChanged()
  }

  const setInputMode = (value) => {
    setInputModeState(value === 'link' ? 'link' : 'image')
    markSourceChanged()
  }

  const setProductUrl = (value) => {
    setProductUrlState(value)
    if (productAnalysis) {
      setProductAnalysis(null)
      setProduct(null)
      setOptionSelections([])
    }
    markSourceChanged()
  }

  const setUserExperience = (value) => {
    setUserExperienceState(value)
    markSourceChanged()
  }

  const setRating = (value) => {
    setRatingState(normalizeReviewRating(value))
    markSourceChanged()
  }

  const updateProduct = (field, value) => {
    setProduct((prev) => ({ ...prev, [field]: value }))
    markSourceChanged()
  }

  const setOptionSelection = (index, value) => {
    setOptionSelections((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
    markSourceChanged()
  }

  const analyzeProduct = () =>
    runTask('analyze', async () => {
      const url = productUrl.trim()
      const result = await analyzeProductUrl(url)
      if (!result?.ok && result?.status === 401) throw new Error(result.error)
      const analysis = result?.ok
        ? normalizeProductAnalysis(result, url)
        : createManualProductAnalysis(url, result?.error)
      setProductAnalysis(analysis)
      setProduct(analysis.product)
      setOptionSelections(getDefaultOptionSelections(analysis.optionGroups))
    }, '상품 정보를 분석하지 못했습니다.')

  const buildKeywordSource = () => {
    const base = {
      images: isLinkMode ? [] : upload.images,
      productUrl: '',
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
        productUrl: productAnalysis.url,
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
      setSourceData({ ...source, images: [] })
      setKeywords(nextKeywords)
      setSelectedKeywords((prev) =>
        prev.filter((k) => nextKeywords.includes(k) || customKeywords.includes(k)),
      )
      setKeywordsStale(false)
      // 키워드를 새로 만들었으면 복원 초안의 "사진 N장" 안내는 더 이상 맞지 않습니다.
      setMissingImageCount(0)
      scrollIntoViewSoon(keywordSectionRef)
    }, '키워드 생성에 실패했습니다.')

  const toggleKeyword = (keyword) => {
    setSelectedKeywords((prev) =>
      prev.includes(keyword) ? prev.filter((k) => k !== keyword) : [...prev, keyword],
    )
  }

  const toggleAllKeywords = () => {
    const all = Array.from(new Set([...keywords, ...customKeywords]))
    setSelectedKeywords((prev) => (prev.length === all.length ? [] : all))
  }

  const addCustomKeyword = (keyword) => {
    setCustomKeywords((prev) => [...prev, keyword])
    setSelectedKeywords((prev) => Array.from(new Set([...prev, keyword])))
  }

  const removeCustomKeyword = (keyword) => {
    setCustomKeywords((prev) => prev.filter((k) => k !== keyword))
    setSelectedKeywords((prev) => prev.filter((k) => k !== keyword))
  }

  const canGenerateReview = Boolean(sourceData) && selectedKeywords.length > 0

  // onStart: 로그인 확인 뒤 실제로 생성을 시작할 때 호출됩니다(모바일에서 초안 화면으로 넘기는 용도).
  const writeReview = (rewriteAction = null, onStart) =>
    runTask('review', async () => {
      if (!sourceData) return
      const base = versions[activeVersion]
      const previousReview = rewriteAction ? base?.text.trim() || '' : ''
      const nextVersion = {
        n: (versions.at(-1)?.n || 0) + 1,
        text: '',
        note: rewriteAction?.label || '',
        // 다듬은 버전은 비교할 원본 버전 번호를 남깁니다.
        from: rewriteAction ? base?.n : undefined,
        keywords: selectedKeywords,
        length,
        tone,
      }
      const kept = versions.slice(-(MAX_VERSIONS - 1))
      // 실패하면 잘려 나간 가장 오래된 버전까지 그대로 되돌립니다.
      const previousVersions = versions
      const previousActive = activeVersion
      setVersions([...kept, nextVersion])
      setActiveVersion(kept.length)
      scrollIntoViewSoon(resultRef)

      let isSuccess = false
      try {
        const { remaining } = await generateReview({
          rating: sourceData.rating,
          keywords: selectedKeywords,
          length,
          tone,
          category: sourceData.category,
          subcategory: sourceData.subcategory,
          productContext: buildEvidenceContext(sourceData),
          previousReview,
          rewriteInstruction: rewriteAction?.instruction || '',
          onChunk: (chunk) => {
            setVersions((prev) =>
              prev.map((v, i) => (i === prev.length - 1 ? { ...v, text: chunk } : v)),
            )
          },
        })
        setReviewsRemaining(remaining)
        isSuccess = true
      } finally {
        if (!isSuccess) {
          setVersions(previousVersions)
          setActiveVersion(previousActive)
        }
      }
    }, '리뷰 생성에 실패했습니다.', onStart)

  const editActiveVersion = (text) => {
    setVersions((prev) => prev.map((v, i) => (i === activeVersion ? { ...v, text } : v)))
  }

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
    setLength,
    tone,
    setTone,
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

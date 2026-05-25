import { useState } from 'react'
import CategoryStep from './steps/CategoryStep'
import UploadStep from './steps/UploadStep'
import ProductOptionStep from './steps/ProductOptionStep'
import KeywordStep from './steps/KeywordStep'
import ReviewStep from './steps/ReviewStep'
import {
  analyzeProductUrl,
  generateKeywords,
  generateReview,
} from './api/geminiService'
import {
  DEFAULT_REVIEW_CATEGORY,
  normalizeReviewCategory,
} from '../../../shared/reviewCategories'
import {
  DEFAULT_REVIEW_LENGTH,
  DEFAULT_REVIEW_TONE,
} from '../../../shared/reviewOptions'
import { normalizeReviewRating } from '../../../shared/reviewRating'

const STEPS = {
  CATEGORY: 'category',
  UPLOAD: 'upload',
  PRODUCT_OPTIONS: 'product-options',
  KEYWORD: 'keyword',
  REVIEW: 'review',
}

const STEP_ORDER = [
  STEPS.CATEGORY,
  STEPS.UPLOAD,
  STEPS.PRODUCT_OPTIONS,
  STEPS.KEYWORD,
  STEPS.REVIEW,
]

const STEP_META = {
  [STEPS.CATEGORY]: {
    title: '리뷰 분야 선택',
    desc: '먼저 장소인지 상품인지 선택합니다.',
    label: '분야',
  },
  [STEPS.UPLOAD]: {
    title: '사진 또는 링크 입력',
    desc: '리뷰 재료와 별점을 입력합니다.',
    label: '입력',
  },
  [STEPS.PRODUCT_OPTIONS]: {
    title: '상품 옵션 선택',
    desc: 'URL 분석 결과에서 옵션을 고르고 반영합니다.',
    label: '옵션',
  },
  [STEPS.KEYWORD]: {
    title: '키워드 선택',
    desc: '옵션과 재료를 반영한 키워드를 고릅니다.',
    label: '키워드',
  },
  [STEPS.REVIEW]: {
    title: '결과 확인',
    desc: '생성된 리뷰를 확인하고 복사합니다.',
    label: '리뷰',
  },
}

const RATING_LABELS = ['', '매우 불만족', '불만족', '보통', '만족', '매우 만족']

async function loadKeywordsFromSource(sourcePayload, previousKeywords = []) {
  const result = await generateKeywords({
    images: sourcePayload.images,
    productUrl: sourcePayload.productUrl,
    productContext: sourcePayload.productContext,
    rating: sourcePayload.rating,
    category: sourcePayload.category,
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

function getDefaultSelections(optionGroups) {
  return Array.isArray(optionGroups)
    ? optionGroups.map((group) => group?.options?.[0]?.value || '')
    : []
}

export default function ReviewGenerator({ onReviewComplete }) {
  const [step, setStep] = useState(STEPS.CATEGORY)
  const [reviewCategory, setReviewCategory] = useState(DEFAULT_REVIEW_CATEGORY)
  const [sourceData, setSourceData] = useState(null)
  const [productAnalysis, setProductAnalysis] = useState(null)
  const [productOptionSelections, setProductOptionSelections] = useState([])
  const [keywords, setKeywords] = useState([])
  const [review, setReview] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState(null)
  const [lastUsedOptions, setLastUsedOptions] = useState(null)

  const handleCategorySelect = (category) => {
    setReviewCategory(normalizeReviewCategory(category))
    setSourceData(null)
    setProductAnalysis(null)
    setProductOptionSelections([])
    setKeywords([])
    setReview('')
    setError(null)
    setLastUsedOptions(null)
    setStep(STEPS.UPLOAD)
  }

  const handleUploadNext = async (data) => {
    const images = Array.isArray(data?.images) ? data.images : []
    const normalizedData = {
      images,
      productUrl: typeof data?.productUrl === 'string' ? data.productUrl.trim() : '',
      productContext: typeof data?.productContext === 'string' ? data.productContext.trim() : '',
      rating: normalizeReviewRating(data?.rating),
      category: normalizeReviewCategory(data?.category ?? reviewCategory),
    }

    setError(null)
    setIsLoading(true)

    try {
      if (normalizedData.productUrl) {
        const analysis = await analyzeProductUrl(normalizedData.productUrl)
        if (!analysis?.ok) {
          throw new Error(analysis?.error || '상품 URL 분석에 실패했습니다.')
        }

        const nextAnalysis = {
          url: analysis.url || normalizedData.productUrl,
          productContext: analysis.productContext || '',
          optionGroups: Array.isArray(analysis.optionGroups) ? analysis.optionGroups : [],
        }

        const nextSource = {
          ...normalizedData,
          productUrl: nextAnalysis.url,
          productContext: nextAnalysis.productContext,
        }

        setSourceData(nextSource)
        setProductAnalysis(nextAnalysis)

        if (nextAnalysis.optionGroups.length > 0) {
          setProductOptionSelections(getDefaultSelections(nextAnalysis.optionGroups))
          setStep(STEPS.PRODUCT_OPTIONS)
          return
        }

        const nextKeywords = await loadKeywordsFromSource(nextSource)
        setKeywords(nextKeywords)
        setStep(STEPS.KEYWORD)
        return
      }

      const nextSource = { ...normalizedData }
      setSourceData(nextSource)
      setProductAnalysis(null)
      setProductOptionSelections([])

      const nextKeywords = await loadKeywordsFromSource(nextSource)
      setKeywords(nextKeywords)
      setStep(STEPS.KEYWORD)
    } catch (e) {
      setError(e instanceof Error ? e.message : '키워드 생성에 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleProductOptionNext = async (selectedSelections) => {
    if (!productAnalysis || !sourceData?.productUrl) return
    const optionGroups = Array.isArray(productAnalysis.optionGroups)
      ? productAnalysis.optionGroups
      : []
    const safeSelections = Array.isArray(selectedSelections)
      ? selectedSelections
      : getDefaultSelections(optionGroups)
    const selectionSummary = buildOptionSummary(optionGroups, safeSelections)
    const nextSource = {
      ...sourceData,
      productContext: selectionSummary
        ? `${sourceData.productContext}\n\n선택 옵션:\n${selectionSummary}`
        : sourceData.productContext,
    }

    setProductOptionSelections(safeSelections)
    setSourceData(nextSource)
    setError(null)
    setIsLoading(true)

    try {
      const nextKeywords = await loadKeywordsFromSource(nextSource)
      setKeywords(nextKeywords)
      setStep(STEPS.KEYWORD)
    } catch (e) {
      setError(e instanceof Error ? e.message : '키워드 생성에 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegenerate = () => {
    if (!lastUsedOptions) return
    handleKeywordNext(
      lastUsedOptions.keywords,
      lastUsedOptions.length,
      lastUsedOptions.tone,
    )
  }

  const handleRefresh = async () => {
    if (!sourceData || isLoading) return
    setError(null)
    setIsLoading(true)
    try {
      const nextKeywords = await loadKeywordsFromSource(sourceData, keywords)
      setKeywords(nextKeywords)
    } catch (e) {
      setError(e instanceof Error ? e.message : '키워드 재생성에 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleBackToUpload = () => {
    setStep(STEPS.UPLOAD)
    setKeywords([])
    setProductAnalysis(null)
    setProductOptionSelections([])
    setError(null)
  }

  const handleResetToStart = () => {
    setStep(STEPS.CATEGORY)
    setReviewCategory(DEFAULT_REVIEW_CATEGORY)
    setSourceData(null)
    setProductAnalysis(null)
    setProductOptionSelections([])
    setKeywords([])
    setReview('')
    setError(null)
    setLastUsedOptions(null)
    setIsLoading(false)
    setIsStreaming(false)
  }

  const handleKeywordNext = async (
    selectedKeywords,
    reviewLength = DEFAULT_REVIEW_LENGTH,
    reviewTone = DEFAULT_REVIEW_TONE,
  ) => {
    if (!sourceData) return
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

  const stepIndex = STEP_ORDER.indexOf(step)
  const stepMeta = STEP_META[step]
  const stepClass = (index) => {
    if (index < stepIndex) return 'stepper__item is-done'
    if (index === stepIndex) return 'stepper__item is-active'
    return 'stepper__item'
  }
  const isEntryStep = step === STEPS.CATEGORY || step === STEPS.UPLOAD

  return (
    <div className={`review-app ${isEntryStep ? 'review-app--upload-center' : ''}`}>
      <header className="review-app__header">
        <p className="review-app__eyebrow">
          STEP {stepIndex + 1} / {STEP_ORDER.length}
        </p>
        <h1 className="review-app__title">{stepMeta.title}</h1>
        <p className="review-app__tagline">{stepMeta.desc}</p>
      </header>

      <nav className="stepper" aria-label="진행 단계">
        {STEP_ORDER.map((item, index) => (
          <div
            key={item}
            className={stepClass(index)}
            aria-current={step === item ? 'step' : undefined}
          >
            <span className="stepper__dot" aria-hidden="true">
              {index + 1}
            </span>
            <span className="stepper__label">{STEP_META[item].label}</span>
          </div>
        ))}
      </nav>

      <main className="review-app__main">
        {error && (
          <div className="banner banner--error" role="alert">
            {error}
          </div>
        )}
        {isLoading && (
          <div className="banner banner--info" role="status" aria-live="polite">
            {step === STEPS.UPLOAD
              ? '이미지를 분석하고 키워드를 준비하고 있습니다.'
              : '선택한 옵션을 반영해 다시 계산하고 있습니다.'}
          </div>
        )}

        {step === STEPS.CATEGORY && <CategoryStep onSelect={handleCategorySelect} />}
        {step === STEPS.UPLOAD && (
          <UploadStep
            category={reviewCategory}
            onNext={handleUploadNext}
            onBackToCategory={() => setStep(STEPS.CATEGORY)}
            isLoading={isLoading}
            ratingLabels={RATING_LABELS}
          />
        )}
        {step === STEPS.PRODUCT_OPTIONS && (
          <ProductOptionStep
            key={productAnalysis?.url || 'product-options'}
            analysis={productAnalysis}
            initialSelections={productOptionSelections}
            onNext={handleProductOptionNext}
            onBack={handleBackToUpload}
            isLoading={isLoading}
          />
        )}
        {step === STEPS.KEYWORD && (
          <KeywordStep
            keywords={keywords}
            initialSelectedKeywords={lastUsedOptions?.keywords}
            initialLength={lastUsedOptions?.length ?? DEFAULT_REVIEW_LENGTH}
            initialTone={lastUsedOptions?.tone ?? DEFAULT_REVIEW_TONE}
            onNext={handleKeywordNext}
            onRefresh={handleRefresh}
            onBackToUpload={handleBackToUpload}
            isLoading={isLoading}
          />
        )}
        {step === STEPS.REVIEW && (
          <ReviewStep
            review={review}
            isStreaming={isStreaming}
            onRegenerate={handleRegenerate}
            onReset={handleResetToStart}
          />
        )}
      </main>

      <footer className="review-app__footer">
        <p>Auto Review Generator</p>
      </footer>
    </div>
  )
}

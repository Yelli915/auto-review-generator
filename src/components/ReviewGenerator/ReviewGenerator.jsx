import { useState } from 'react'
import UploadStep from './steps/UploadStep'
import KeywordStep from './steps/KeywordStep'
import ReviewStep from './steps/ReviewStep'
import { generateKeywords, generateReview } from './api/geminiService'
import { normalizeReviewCategory } from '../../../shared/reviewCategories'
import {
  DEFAULT_REVIEW_LENGTH,
  DEFAULT_REVIEW_TONE,
} from '../../../shared/reviewOptions'

const STEPS = { UPLOAD: 'upload', KEYWORD: 'keyword', REVIEW: 'review' }
const RATING_LABELS = ['', '매우 불만족', '불만족', '보통', '만족', '매우 만족']

async function loadKeywordsFromImage(imagePayload) {
  const result = await generateKeywords({
    images: imagePayload.images,
    rating: imagePayload.rating,
    category: imagePayload.category,
  })
  if (!result?.ok) {
    throw new Error(result?.error || '키워드 생성 실패')
  }
  return Array.isArray(result.keywords) ? result.keywords : []
}

export default function ReviewGenerator({ onReviewComplete }) {
  const [step, setStep] = useState(STEPS.UPLOAD)
  const [imageData, setImageData] = useState(null)
  const [keywords, setKeywords] = useState([])
  const [review, setReview] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState(null)
  const [lastUsedOptions, setLastUsedOptions] = useState(null)

  const handleUploadNext = async (data) => {
    const images = Array.isArray(data?.images) ? data.images : []
    const normalizedData = {
      images,
      rating: Number.isFinite(Number(data?.rating)) ? Number(data.rating) : 5,
      category: normalizeReviewCategory(data?.category),
    }

    setImageData(normalizedData)
    setError(null)
    setIsLoading(true)
    try {
      const nextKeywords = await loadKeywordsFromImage(normalizedData)
      setKeywords(nextKeywords)
      setStep(STEPS.KEYWORD)
    } catch (e) {
      setError(e instanceof Error ? e.message : '키워드 생성 실패')
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

  const handleBackToKeyword = () => {
    setStep(STEPS.KEYWORD)
    setReview('')
    setError(null)
  }

  const handleRefresh = async () => {
    if (!imageData?.images?.length || isLoading) return
    setError(null)
    setIsLoading(true)
    try {
      const nextKeywords = await loadKeywordsFromImage(imageData)
      setKeywords(nextKeywords)
    } catch (e) {
      setError(e instanceof Error ? e.message : '키워드 생성 실패')
    } finally {
      setIsLoading(false)
    }
  }

  const handleBackToUpload = () => {
    setStep(STEPS.UPLOAD)
    setKeywords([])
    setError(null)
  }

  const handleKeywordNext = async (
    selectedKeywords,
    reviewLength = DEFAULT_REVIEW_LENGTH,
    reviewTone = DEFAULT_REVIEW_TONE,
  ) => {
    setLastUsedOptions({ keywords: selectedKeywords, length: reviewLength, tone: reviewTone })
    setReview('')
    setError(null)
    setStep(STEPS.REVIEW)
    setIsStreaming(true)

    let fullReview = ''
    let isSuccess = false
    try {
      await generateReview({
        rating: imageData.rating,
        keywords: selectedKeywords,
        length: reviewLength,
        tone: reviewTone,
        category: imageData.category,
        onChunk: (chunk) => {
          fullReview += chunk
          setReview(fullReview)
        },
      })
      isSuccess = true
    } catch (e) {
      setError(e instanceof Error ? e.message : '리뷰 생성 실패')
      setStep(STEPS.KEYWORD)
    } finally {
      setIsStreaming(false)
      if (isSuccess) {
        onReviewComplete?.(fullReview)
      }
    }
  }

  const stepIndex = {
    [STEPS.UPLOAD]: 0,
    [STEPS.KEYWORD]: 1,
    [STEPS.REVIEW]: 2,
  }[step]
  const stepMeta = [
    { title: '사진 입력', desc: '리뷰 분야, 이미지, 별점을 선택합니다.' },
    { title: '옵션 선택', desc: '키워드, 길이, 말투를 정합니다.' },
    { title: '결과 확인', desc: '생성된 리뷰를 확인하고 복사합니다.' },
  ][stepIndex]

  const stepClass = (i) => {
    if (i < stepIndex) return 'stepper__item is-done'
    if (i === stepIndex) return 'stepper__item is-active'
    return 'stepper__item'
  }

  const isUploadStep = step === STEPS.UPLOAD

  return (
    <div className={`review-app ${isUploadStep ? 'review-app--upload-center' : ''}`}>
      <header className="review-app__header">
        <p className="review-app__eyebrow">STEP {stepIndex + 1} / 3</p>
        <h1 className="review-app__title">{stepMeta.title}</h1>
        <p className="review-app__tagline">
          {stepMeta.desc}
        </p>
      </header>

      <nav className="stepper" aria-label="진행 단계">
        <div
          className={stepClass(0)}
          aria-current={step === STEPS.UPLOAD ? 'step' : undefined}
        >
          <span className="stepper__dot" aria-hidden="true">
            1
          </span>
          <span className="stepper__label">사진</span>
        </div>
        <div
          className={stepClass(1)}
          aria-current={step === STEPS.KEYWORD ? 'step' : undefined}
        >
          <span className="stepper__dot" aria-hidden="true">
            2
          </span>
          <span className="stepper__label">옵션</span>
        </div>
        <div
          className={stepClass(2)}
          aria-current={step === STEPS.REVIEW ? 'step' : undefined}
        >
          <span className="stepper__dot" aria-hidden="true">
            3
          </span>
          <span className="stepper__label">리뷰</span>
        </div>
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
              ? '이미지를 분석해 키워드를 준비하고 있습니다.'
              : '선택한 이미지로 키워드를 다시 생성하고 있습니다.'}
          </div>
        )}

        {step === STEPS.UPLOAD && (
          <UploadStep
            onNext={handleUploadNext}
            isLoading={isLoading}
            ratingLabels={RATING_LABELS}
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
            onBack={handleBackToKeyword}
            onReset={handleBackToUpload}
            onRegenerate={handleRegenerate}
            rating={imageData?.rating}
            ratingLabels={RATING_LABELS}
            selectedKeywords={lastUsedOptions?.keywords}
            reviewLength={lastUsedOptions?.length}
            reviewTone={lastUsedOptions?.tone}
            reviewCategory={imageData?.category}
            imageCount={imageData?.images?.length}
          />
        )}
      </main>

      <footer className="review-app__footer">
        <p>Powered by Gemini 2.5 Flash</p>
      </footer>
    </div>
  )
}

import { useState } from 'react'
import UploadStep from './steps/UploadStep'
import KeywordStep from './steps/KeywordStep'
import ReviewStep from './steps/ReviewStep'
import { generateKeywords, generateReview } from './api/geminiService'

const STEPS = { UPLOAD: 'upload', KEYWORD: 'keyword', REVIEW: 'review' }

async function loadKeywordsFromImage(imagePayload) {
  const result = await generateKeywords({
    imageBase64: imagePayload.base64Image,
    rating: imagePayload.rating,
    mimeType: imagePayload.mimeType || 'image/jpeg',
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

  const handleUploadNext = async (data) => {
    const normalizedData = {
      ...data,
      base64Image: data?.base64Image || data?.base64 || '',
      rating: Number.isFinite(Number(data?.rating)) ? Number(data.rating) : 5,
      length: data?.length || 'medium',
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

  const handleRefresh = async () => {
    if (!imageData?.base64Image) return
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

  const handleKeywordNext = async (selectedKeywords) => {
    setReview('')
    setError(null)
    setStep(STEPS.REVIEW)
    setIsStreaming(true)

    let fullReview = ''
    try {
      await generateReview(
        imageData.rating,
        selectedKeywords,
        imageData.length,
        (chunk) => {
          fullReview += chunk
          setReview(fullReview)
        },
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : '리뷰 생성 실패')
      setStep(STEPS.KEYWORD)
    } finally {
      setIsStreaming(false)
      onReviewComplete?.(fullReview)
    }
  }

  const stepIndex = {
    [STEPS.UPLOAD]: 0,
    [STEPS.KEYWORD]: 1,
    [STEPS.REVIEW]: 2,
  }[step]

  const stepClass = (i) => {
    if (i < stepIndex) return 'stepper__item is-done'
    if (i === stepIndex) return 'stepper__item is-active'
    return 'stepper__item'
  }

  return (
    <div className="review-app">
      <header className="review-app__header">
        <h1 className="review-app__title">Auto Review</h1>
        <p className="review-app__tagline">
          사진과 별점만으로 키워드를 고르고, AI가 리뷰 초안을 만들어 드립니다.
        </p>
      </header>

      <nav className="stepper" aria-label="진행 단계">
        <div className={stepClass(0)}>
          <span className="stepper__dot" aria-hidden="true">
            1
          </span>
          <span className="stepper__label">사진</span>
        </div>
        <div className={stepClass(1)}>
          <span className="stepper__dot" aria-hidden="true">
            2
          </span>
          <span className="stepper__label">키워드</span>
        </div>
        <div className={stepClass(2)}>
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

        {step === STEPS.UPLOAD && (
          <UploadStep onNext={handleUploadNext} isLoading={isLoading} />
        )}
        {step === STEPS.KEYWORD && (
          <KeywordStep
            keywords={keywords}
            onNext={handleKeywordNext}
            onRefresh={handleRefresh}
            onBackToUpload={handleBackToUpload}
            isLoading={isLoading}
          />
        )}
        {step === STEPS.REVIEW && (
          <ReviewStep review={review} isStreaming={isStreaming} />
        )}
      </main>
    </div>
  )
}

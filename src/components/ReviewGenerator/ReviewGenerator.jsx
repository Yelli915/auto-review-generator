import { useState } from 'react'
import UploadStep from './steps/UploadStep'
import KeywordStep from './steps/KeywordStep'
import ReviewStep from './steps/ReviewStep'
import { generateKeywords, generateReview } from './api/geminiService'

const STEPS = { UPLOAD: 'upload', KEYWORD: 'keyword', REVIEW: 'review' }

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
      const result = await generateKeywords({
        imageBase64: normalizedData.base64Image,
        rating: normalizedData.rating,
        mimeType: normalizedData.mimeType || 'image/jpeg',
      })
      if (!result?.ok) {
        throw new Error(result?.error || '키워드 생성 실패')
      }
      setKeywords(Array.isArray(result.keywords) ? result.keywords : [])
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
      const result = await generateKeywords({
        imageBase64: imageData.base64Image,
        rating: imageData.rating,
        mimeType: imageData.mimeType || 'image/jpeg',
      })
      if (!result?.ok) {
        throw new Error(result?.error || '키워드 생성 실패')
      }
      setKeywords(Array.isArray(result.keywords) ? result.keywords : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '키워드 생성 실패')
    } finally {
      setIsLoading(false)
    }
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

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto' }}>
      {error && (
        <div
          style={{
            padding: '12px 16px',
            margin: '8px 16px',
            background: '#fff0f0',
            border: '1px solid #ffcccc',
            borderRadius: '8px',
            color: '#cc0000',
            fontSize: '14px',
          }}
        >
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
          isLoading={isLoading}
        />
      )}
      {step === STEPS.REVIEW && (
        <ReviewStep review={review} isStreaming={isStreaming} />
      )}
    </div>
  )
}

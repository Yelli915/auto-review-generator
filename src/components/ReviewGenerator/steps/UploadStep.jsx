import { useEffect, useId, useRef, useState } from 'react'
import { resizeAndConvertToBase64 } from '../utils/imageUtils'

export default function UploadStep({ onNext, isLoading }) {
  const inputId = useId()
  const ratingId = useId()
  const lengthId = useId()
  const [fileData, setFileData] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [rating, setRating] = useState(5)
  const [length, setLength] = useState('medium')
  const [message, setMessage] = useState('이미지를 선택해 주세요.')
  const previewUrlRef = useRef('')

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const objectUrl = URL.createObjectURL(file)
    previewUrlRef.current = objectUrl
    setPreviewUrl(objectUrl)
    setMessage(`선택됨: ${file.name}`)

    resizeAndConvertToBase64(file, { maxEdge: 512, quality: 0.75 })
      .then((base64Image) => {
        setFileData({
          file,
          previewUrl: objectUrl,
          base64Image,
          mimeType: 'image/jpeg',
        })
      })
      .catch(() => setMessage('이미지 변환에 실패했습니다.'))
  }

  function handleNext() {
    if (!fileData || typeof onNext !== 'function') return
    onNext({
      ...fileData,
      rating: Number(rating),
      length,
    })
  }

  return (
    <section>
      <h3>1. 사진 업로드</h3>
      <label htmlFor={inputId}>사진 선택</label>
      <input id={inputId} type="file" accept="image/*" onChange={handleFileChange} />

      <div style={{ marginTop: '12px' }}>
        <label htmlFor={ratingId}>별점</label>
        <select
          id={ratingId}
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
        >
          <option value={1}>1점</option>
          <option value={2}>2점</option>
          <option value={3}>3점</option>
          <option value={4}>4점</option>
          <option value={5}>5점</option>
        </select>
      </div>

      <div style={{ marginTop: '8px' }}>
        <label htmlFor={lengthId}>리뷰 길이</label>
        <select id={lengthId} value={length} onChange={(e) => setLength(e.target.value)}>
          <option value="short">짧게</option>
          <option value="medium">보통</option>
          <option value="long">길게</option>
        </select>
      </div>

      <p>{message}</p>
      {previewUrl && <img src={previewUrl} alt="업로드 미리보기" style={{ maxWidth: '100%' }} />}
      <button
        type="button"
        onClick={handleNext}
        disabled={!fileData || isLoading}
        style={{ width: '100%', height: '48px', marginTop: '12px' }}
      >
        {isLoading ? '키워드 생성 중...' : '다음'}
      </button>
    </section>
  )
}

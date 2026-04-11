import { useEffect, useId, useRef, useState } from 'react'
import { resizeAndConvertToBase64 } from '../utils/imageUtils'

export default function UploadStep({ onNext, isLoading }) {
  const inputId = useId()
  const ratingId = useId()
  const [fileData, setFileData] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [rating, setRating] = useState(5)
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
    })
  }

  return (
    <section className="step-card">
      <h2 className="step-card__title">사진 업로드</h2>
      <p className="step-card__lede">
        제품 사진과 별점을 정하면, 그에 맞는 키워드를 자동으로 뽑습니다.
      </p>

      <div className="field">
        <span className="field__label" id={`${inputId}-label`}>
          이미지
        </span>
        <label
          className={`file-drop${fileData ? ' file-drop--ready' : ''}`}
          htmlFor={inputId}
        >
          <input
            id={inputId}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            aria-labelledby={`${inputId}-label`}
          />
          <p className="file-drop__text">탭하여 사진 선택</p>
          <p className="file-drop__sub">JPG, PNG 등 (최대 화면에 맞게 줄여 전송)</p>
        </label>
        <p className="field__hint">{message}</p>
      </div>

      {previewUrl && (
        <div className="preview-frame">
          <img src={previewUrl} alt="선택한 이미지 미리보기" />
        </div>
      )}

      <div className="field">
        <label className="field__label" htmlFor={ratingId}>
          별점
        </label>
        <select
          id={ratingId}
          className="select-input"
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
          disabled={isLoading}
        >
          <option value={1}>1점</option>
          <option value={2}>2점</option>
          <option value={3}>3점</option>
          <option value={4}>4점</option>
          <option value={5}>5점</option>
        </select>
      </div>

      <div className="btn-row">
        <button
          type="button"
          className="btn btn--primary btn--lg"
          onClick={handleNext}
          disabled={!fileData || isLoading}
        >
          {isLoading ? '키워드 생성 중…' : '다음: 키워드'}
        </button>
      </div>
    </section>
  )
}

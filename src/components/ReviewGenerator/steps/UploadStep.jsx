import { useEffect, useId, useRef, useState } from 'react'
import { resizeAndConvertToBase64 } from '../utils/imageUtils'

const MAX_FILE_SIZE_MB = 15

function StarRating({ value, onChange, disabled, ratingLabels }) {
  const [hovered, setHovered] = useState(null)
  const display = hovered ?? value

  return (
    <div
      className="star-rating"
      role="group"
      aria-label="별점 선택"
      onMouseLeave={() => setHovered(null)}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={`star${display >= star ? ' star--on' : ''}`}
          onMouseEnter={() => !disabled && setHovered(star)}
          onClick={() => !disabled && onChange(star)}
          aria-label={`${star}점`}
          aria-pressed={value === star}
          tabIndex={disabled ? -1 : 0}
        >
          ★
        </button>
      ))}
      <span className="star-rating__label">
        {value}점 · {ratingLabels[display]}
      </span>
    </div>
  )
}

export default function UploadStep({ onNext, isLoading, ratingLabels }) {
  const inputId = useId()
  const [fileData, setFileData] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [rating, setRating] = useState(5)
  const [status, setStatus] = useState({ text: '', isError: false })
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const previewUrlRef = useRef('')

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  function processFile(file) {
    if (!file.type.startsWith('image/')) {
      setStatus({ text: '이미지 파일(JPG, PNG 등)만 업로드할 수 있습니다.', isError: true })
      return
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setStatus({ text: `파일 크기는 ${MAX_FILE_SIZE_MB}MB 이하여야 합니다.`, isError: true })
      return
    }

    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const objectUrl = URL.createObjectURL(file)
    previewUrlRef.current = objectUrl
    setPreviewUrl(objectUrl)
    setFileData(null)
    setIsProcessing(true)
    setStatus({ text: '', isError: false })

    resizeAndConvertToBase64(file, { maxEdge: 512, quality: 0.75 })
      .then((base64Image) => {
        setFileData({ file, previewUrl: objectUrl, base64Image, mimeType: 'image/jpeg' })
        setStatus({ text: file.name, isError: false })
      })
      .catch(() => setStatus({ text: '이미지 변환에 실패했습니다.', isError: true }))
      .finally(() => setIsProcessing(false))
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  function handleDragOver(e) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false)
  }

  function handleDrop(e) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  function handleNext() {
    if (!fileData || typeof onNext !== 'function') return
    onNext({ ...fileData, rating: Number(rating) })
  }

  const dropClass = [
    'file-drop',
    fileData ? 'file-drop--ready' : '',
    isDragging ? 'file-drop--drag' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const busy = isLoading || isProcessing

  return (
    <section className="step-card step-card--enter">
      <h2 className="step-card__title">사진 업로드</h2>
      <p className="step-card__lede">
        제품 사진과 별점을 선택하면 그에 맞는 키워드를 자동으로 추출합니다.
      </p>

      <div className="field">
        <span className="field__label" id={`${inputId}-label`}>
          이미지
        </span>
        <label
          className={dropClass}
          htmlFor={inputId}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            id={inputId}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            aria-labelledby={`${inputId}-label`}
          />
          {isDragging ? (
            <p className="file-drop__text file-drop__text--drag">여기에 놓으세요</p>
          ) : (
            <>
              <p className="file-drop__text">
                {fileData ? '다른 사진으로 교체' : '탭하거나 파일을 끌어다 놓으세요'}
              </p>
              <p className="file-drop__sub">
                JPG · PNG · WEBP 등 · 최대 {MAX_FILE_SIZE_MB}MB
              </p>
            </>
          )}
        </label>
        {status.text && (
          <p
            className={`field__hint ${status.isError ? 'field__hint--error' : 'field__hint--file'}`}
          >
            {status.text}
          </p>
        )}
      </div>

      {previewUrl && (
        <div className="preview-frame">
          <img src={previewUrl} alt="선택한 이미지 미리보기" />
        </div>
      )}

      <div className="field field--no-mb">
        <label className="field__label">별점</label>
        <StarRating
          value={rating}
          onChange={setRating}
          disabled={busy}
          ratingLabels={ratingLabels}
        />
      </div>

      <div className="btn-row">
        <button
          type="button"
          className="btn btn--primary btn--lg"
          onClick={handleNext}
          disabled={!fileData || busy}
        >
          {isLoading
            ? '키워드 생성 중…'
            : isProcessing
              ? '이미지 처리 중…'
              : '다음: 키워드 선택'}
        </button>
      </div>
    </section>
  )
}

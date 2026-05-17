import { useEffect, useId, useRef, useState } from 'react'
import ImageEditPanel from './ImageEditPanel'
import ImagePreviewGrid from './ImagePreviewGrid'
import {
  DEFAULT_IMAGE_EDIT,
  transformImageFile,
} from '../utils/imageUtils'
import {
  DEFAULT_REVIEW_CATEGORY,
  MAX_REVIEW_IMAGE_COUNT,
  REVIEW_CATEGORY_OPTIONS,
} from '../../../../shared/reviewCategories'

const MAX_FILE_SIZE_MB = 15
const IMAGE_RESIZE_OPTIONS = { maxEdge: 448, quality: 0.68 }

function revokeObjectUrls(urls) {
  urls.forEach((url) => URL.revokeObjectURL(url))
}

function getImageObjectUrls(images) {
  return images.flatMap((image) =>
    [image.previewUrl, image.editedPreviewUrl].filter(Boolean),
  )
}

function getImageFileNames(images) {
  return images.map((image) => image.file.name).join(', ')
}

async function createReviewImage(file, previewUrl) {
  const { base64 } = await transformImageFile(file, IMAGE_RESIZE_OPTIONS)
  return {
    file,
    previewUrl,
    base64Image: base64,
    mimeType: 'image/jpeg',
    ...DEFAULT_IMAGE_EDIT,
  }
}

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
        {display}점 · {ratingLabels[display]}
      </span>
    </div>
  )
}

export default function UploadStep({ onNext, isLoading, ratingLabels }) {
  const inputId = useId()
  const categoryId = useId()
  const inputRef = useRef(null)
  const [images, setImages] = useState([])
  const [reviewCategory, setReviewCategory] = useState(DEFAULT_REVIEW_CATEGORY)
  const [rating, setRating] = useState(5)
  const [status, setStatus] = useState({ text: '', isError: false })
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [editingIndex, setEditingIndex] = useState(null)
  const objectUrlsRef = useRef([])
  const processTokenRef = useRef(0)

  useEffect(() => {
    return () => {
      revokeObjectUrls(objectUrlsRef.current)
    }
  }, [])

  function replaceImages(nextImages) {
    revokeObjectUrls(objectUrlsRef.current)
    objectUrlsRef.current = getImageObjectUrls(nextImages)
    setImages(nextImages)
  }

  function validateSelectedFiles(files) {
    if (!files.length) return '이미지를 1장 이상 선택해 주세요.'
    if (files.length > MAX_REVIEW_IMAGE_COUNT) {
      return `이미지는 최대 ${MAX_REVIEW_IMAGE_COUNT}장까지 업로드할 수 있습니다.`
    }
    const invalidType = files.find((file) => !file.type.startsWith('image/'))
    if (invalidType) return '이미지 파일(JPG, PNG 등)만 업로드할 수 있습니다.'
    const oversized = files.find((file) => file.size > MAX_FILE_SIZE_MB * 1024 * 1024)
    if (oversized) return `파일 크기는 각 ${MAX_FILE_SIZE_MB}MB 이하여야 합니다.`
    return ''
  }

  function processFiles(fileList) {
    const token = processTokenRef.current + 1
    processTokenRef.current = token
    const files = Array.from(fileList || [])
    const validationError = validateSelectedFiles(files)
    if (validationError) {
      setIsProcessing(false)
      setStatus({ text: validationError, isError: true })
      return
    }

    const nextPreviewUrls = files.map((file) => URL.createObjectURL(file))
    replaceImages([])
    objectUrlsRef.current = nextPreviewUrls
    setEditingIndex(null)
    setIsProcessing(true)
    setStatus({ text: '', isError: false })

    Promise.all(
      files.map((file, index) =>
        createReviewImage(file, nextPreviewUrls[index]),
      ),
    )
      .then((nextImages) => {
        if (processTokenRef.current !== token) return
        objectUrlsRef.current = getImageObjectUrls(nextImages)
        setImages(nextImages)
        setStatus({
          text: getImageFileNames(nextImages),
          isError: false,
        })
      })
      .catch(() => {
        if (processTokenRef.current !== token) return
        replaceImages([])
        setStatus({ text: '이미지 변환에 실패했습니다.', isError: true })
      })
      .finally(() => {
        if (processTokenRef.current !== token) return
        setIsProcessing(false)
      })
  }

  function handleFileChange(e) {
    processFiles(e.target.files)
    e.target.value = ''
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
    processFiles(e.dataTransfer.files)
  }

  function handleRemoveImage(index) {
    if (busy) return
    const nextImages = images.filter((_, i) => i !== index)
    revokeObjectUrls(getImageObjectUrls([images[index]]))
    objectUrlsRef.current = getImageObjectUrls(nextImages)
    setImages(nextImages)
    setEditingIndex((prev) => {
      if (prev == null) return null
      if (prev === index) return null
      return prev > index ? prev - 1 : prev
    })
    setStatus({
      text: nextImages.length ? getImageFileNames(nextImages) : '',
      isError: false,
    })
  }

  async function handleApplyImageEdit(editState) {
    if (editingIndex == null || !images[editingIndex] || busy) return
    const index = editingIndex
    const image = images[index]
    setIsProcessing(true)
    setStatus({ text: '이미지 편집을 적용하는 중입니다.', isError: false })
    try {
      const result = await transformImageFile(image.file, {
        ...IMAGE_RESIZE_OPTIONS,
        ...editState,
        createPreviewUrl: true,
      })
      if (image.editedPreviewUrl) URL.revokeObjectURL(image.editedPreviewUrl)
      const nextImages = images.map((item, i) =>
        i === index
          ? {
              ...item,
              ...editState,
              base64Image: result.base64,
              editedPreviewUrl: result.previewUrl || '',
            }
          : item,
      )
      objectUrlsRef.current = getImageObjectUrls(nextImages)
      setImages(nextImages)
      setStatus({ text: `${index + 1}번째 이미지 편집을 적용했습니다.`, isError: false })
    } catch {
      setStatus({ text: '이미지 편집 적용에 실패했습니다.', isError: true })
    } finally {
      setIsProcessing(false)
    }
  }

  function handleNext() {
    if (!images.length || typeof onNext !== 'function') return
    onNext({
      images,
      rating: Number(rating),
      category: reviewCategory,
    })
  }

  const dropClass = [
    'file-drop',
    images.length ? 'file-drop--ready' : '',
    isDragging ? 'file-drop--drag' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const busy = isLoading || isProcessing

  return (
    <section className="step-card step-card--enter">
      <h2 className="step-card__title">사진 업로드</h2>
      <p className="step-card__lede">
        리뷰 분야와 사진, 별점을 선택하면 그에 맞는 키워드를 자동으로 추출합니다.
      </p>

      <div className="field">
        <label className="field__label" htmlFor={categoryId}>
          리뷰 분야
        </label>
        <select
          id={categoryId}
          className="select-input"
          value={reviewCategory}
          onChange={(e) => setReviewCategory(e.target.value)}
          disabled={busy}
        >
          {REVIEW_CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="field__label">별점</label>
        <StarRating
          value={rating}
          onChange={setRating}
          disabled={busy}
          ratingLabels={ratingLabels}
        />
      </div>

      <div className="upload-row">
        <div className="field upload-row__drop">
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
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              disabled={busy}
              onChange={handleFileChange}
              aria-labelledby={`${inputId}-label`}
            />
            {isDragging ? (
              <p className="file-drop__text file-drop__text--drag">여기에 놓으세요</p>
            ) : (
              <>
                <p className="file-drop__text">
                  탭하거나 파일을 끌어다 놓으세요
                </p>
                <p className="file-drop__sub">
                  JPG · PNG · WEBP 등 · 최대 {MAX_REVIEW_IMAGE_COUNT}장 · 각 {MAX_FILE_SIZE_MB}MB
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

        <ImagePreviewGrid
          images={images}
          isBusy={busy}
          onAdd={() => inputRef.current?.click()}
          onEdit={setEditingIndex}
          onRemove={handleRemoveImage}
        />
      </div>

      <ImageEditPanel
        key={editingIndex == null ? 'empty' : images[editingIndex]?.previewUrl}
        image={editingIndex == null ? null : images[editingIndex]}
        imageNumber={editingIndex == null ? 0 : editingIndex + 1}
        isBusy={busy}
        onApply={handleApplyImageEdit}
        onClose={() => setEditingIndex(null)}
      />

      <div className="btn-row">
        <button
          type="button"
          className="btn btn--primary btn--lg"
          onClick={handleNext}
          disabled={images.length === 0 || busy}
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

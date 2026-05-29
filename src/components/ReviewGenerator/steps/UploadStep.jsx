import { useEffect, useId, useRef, useState } from 'react'
import ImageEditPanel from './ImageEditPanel'
import ImagePreviewGrid from './ImagePreviewGrid'
import {
  DEFAULT_IMAGE_EDIT,
  transformImageFile,
} from '../utils/imageUtils'
import {
  MAX_REVIEW_IMAGE_COUNT,
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

export default function UploadStep({
  category,
  onNext,
  onBackToCategory,
  isLoading,
  ratingLabels,
}) {
  const inputId = useId()
  const inputRef = useRef(null)
  const [images, setImages] = useState([])
  const [inputMode, setInputMode] = useState(category === 'product' ? 'link' : 'image')
  const [productUrl, setProductUrl] = useState('')
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

  useEffect(() => {
    if (category !== 'product' && inputMode !== 'image') {
      setInputMode('image')
    }
  }, [category, inputMode])

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
          text: `${nextImages.length}장 선택됨 · ${getImageFileNames(nextImages)}`,
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
    if (typeof onNext !== 'function') return
    const safeProductUrl = productUrl.trim()
    if (inputMode === 'link') {
      if (!safeProductUrl) {
        setStatus({ text: '상품 링크를 입력해 주세요.', isError: true })
        return
      }
      onNext({
        images: [],
        productUrl: safeProductUrl,
        rating: Number(rating),
        category,
      })
      return
    }
    if (!images.length) return
    onNext({
      images,
      productUrl: '',
      rating: Number(rating),
      category,
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
  const canUseLink = category === 'product'
  const isLinkMode = canUseLink && inputMode === 'link'

  return (
    <section className="step-card step-card--enter">
      <h2 className="step-card__title">사진 업로드</h2>
      <p className="step-card__lede">
        사진과 별점을 선택하면 앞에서 고른 분야에 맞춰 키워드를 자동으로 추출합니다.
      </p>

      <div className="field">
        <label className="field__label">별점</label>
        <StarRating
          value={rating}
          onChange={setRating}
          disabled={busy}
          ratingLabels={ratingLabels}
        />
      </div>

      {canUseLink && (
        <div className="field">
          <span className="field__label">입력 방식</span>
          <div className="input-mode" role="group" aria-label="입력 방식 선택">
            <button
              type="button"
              className={`input-mode__button${isLinkMode ? ' is-active' : ''}`}
              onClick={() => setInputMode('link')}
              disabled={busy}
            >
              상품 링크
            </button>
            <button
              type="button"
              className={`input-mode__button${!isLinkMode ? ' is-active' : ''}`}
              onClick={() => setInputMode('image')}
              disabled={busy}
            >
              사진
            </button>
          </div>
        </div>
      )}

      {isLinkMode ? (
        <div className="field">
          <label className="field__label" htmlFor={`${inputId}-url`}>
            상품 링크
          </label>
          <input
            id={`${inputId}-url`}
            className="text-input"
            type="url"
            inputMode="url"
            placeholder="https://example.com/product"
            value={productUrl}
            onChange={(e) => {
              setProductUrl(e.target.value)
              setStatus({ text: '', isError: false })
            }}
            disabled={busy}
          />
          <p className="field__hint">
            공개 상품 페이지의 상품명, 브랜드, 이미지, 가격을 자동 인식합니다. 읽을 수 없는 사이트는 다음 단계에서 직접 보완할 수 있습니다.
          </p>
          {status.text && (
            <p className={`field__hint ${status.isError ? 'field__hint--error' : ''}`}>
              {status.text}
            </p>
          )}
        </div>
      ) : (
      <>
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
                <span className="file-drop__icon" aria-hidden="true">+</span>
                <p className="file-drop__text">
                  {images.length ? '이미지를 더 추가하거나 다시 선택하세요' : '이미지를 추가하세요'}
                </p>
                <p className="file-drop__sub">
                  클릭 또는 드래그 앤 드롭 · 최대 {MAX_REVIEW_IMAGE_COUNT}장 · 각 {MAX_FILE_SIZE_MB}MB
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
      </>
      )}

      <div className="btn-row">
        <button
          type="button"
          className="btn btn--primary btn--lg"
          onClick={handleNext}
          disabled={(isLinkMode ? !productUrl.trim() : images.length === 0) || busy}
        >
          {isLoading
            ? '키워드 생성 중…'
            : isProcessing
              ? '이미지 처리 중…'
              : '다음: 키워드 선택'}
        </button>
        {typeof onBackToCategory === 'function' && (
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onBackToCategory}
            disabled={busy}
          >
            리뷰 분야 다시 선택
          </button>
        )}
      </div>
    </section>
  )
}

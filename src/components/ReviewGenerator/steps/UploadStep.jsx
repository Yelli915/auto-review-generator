import { useId, useRef, useState } from 'react'
import { MAX_REVIEW_IMAGE_COUNT } from '../../../../shared/reviewCategories'
import { useUploadImages } from '../hooks/useUploadImages'
import ImageEditPanel from './ImageEditPanel'
import ImagePreviewGrid from './ImagePreviewGrid'
import StarRating from './StarRating'
import { MAX_FILE_SIZE_MB } from '../utils/uploadImages'

export default function UploadStep({
  category,
  subcategory,
  onNext,
  onBackToCategory,
  isLoading,
  ratingLabels,
}) {
  const inputId = useId()
  const inputRef = useRef(null)
  const [inputMode, setInputMode] = useState(category === 'product' ? 'link' : 'image')
  const [productUrl, setProductUrl] = useState('')
  const [userExperience, setUserExperience] = useState('')
  const [rating, setRating] = useState(5)
  const canUseLink = category === 'product'
  const effectiveInputMode = canUseLink ? inputMode : 'image'
  const isLinkMode = effectiveInputMode === 'link'
  const title = isLinkMode ? '상품 링크 입력' : '사진 업로드'
  const lede = isLinkMode
    ? '상품 페이지를 분석해 리뷰 키워드의 기본 재료를 준비합니다.'
    : '사진과 별점을 바탕으로 앞에서 고른 분야에 맞는 키워드를 추출합니다.'
  const experiencePlaceholder = category === 'place'
    ? '예: 대기 시간이 조금 있었지만 좌석 간격이 넓고 조명이 편했어요. 직원 안내는 친절했어요.'
    : '예: 생각보다 작았지만 마감이 깔끔했어요. 향은 강하지 않았고, 포장은 살짝 아쉬웠어요.'
  const {
    busy,
    editingIndex,
    handleApplyImageEdit,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileChange,
    handleRemoveImage,
    images,
    isDragging,
    isProcessing,
    setEditingIndex,
    setStatus,
    status,
  } = useUploadImages({
    isLoading,
    isLinkMode,
    switchToImageMode: () => setInputMode('image'),
  })
  const primaryLabel = isLoading
    ? isLinkMode ? '상품 정보 분석 중...' : '키워드 생성 중...'
    : isProcessing
      ? '이미지 처리 중...'
      : isLinkMode
        ? '상품 정보 분석하기'
        : '사진으로 키워드 만들기'

  function handleNext() {
    if (typeof onNext !== 'function') return
    const safeProductUrl = productUrl.trim()
    const safeUserExperience = userExperience.trim()
    if (isLinkMode) {
      if (!safeProductUrl) {
        setStatus({ text: '상품 링크를 입력해 주세요.', isError: true })
        return
      }
      onNext({
        images: [],
        productUrl: safeProductUrl,
        userExperience: safeUserExperience,
        rating: Number(rating),
        category,
        subcategory,
      })
      return
    }
    if (!images.length) return
    onNext({
      images,
      productUrl: '',
      userExperience: safeUserExperience,
      rating: Number(rating),
      category,
      subcategory,
    })
  }

  const dropClass = [
    'file-drop',
    images.length ? 'file-drop--ready' : '',
    isDragging ? 'file-drop--drag' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section className="step-card step-card--enter">
      <h2 className="step-card__title">{title}</h2>
      <p className="step-card__lede">{lede}</p>

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
                  클릭, 붙여넣기(Ctrl+V) 또는 드래그 앤 드롭 · 최대 {MAX_REVIEW_IMAGE_COUNT}장 · 각 {MAX_FILE_SIZE_MB}MB
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

      <div className="field">
        <label className="field__label" htmlFor={`${inputId}-experience`}>
          직접 경험한 내용 <span className="field__label-note">선택 사항</span>
        </label>
        <textarea
          id={`${inputId}-experience`}
          className="text-input"
          rows={4}
          maxLength={800}
          placeholder={experiencePlaceholder}
          value={userExperience}
          onChange={(e) => setUserExperience(e.target.value)}
          disabled={busy}
        />
        <p className="field__hint">
          실제로 느낀 점을 적으면 리뷰가 더 자연스럽고 과장 없이 작성됩니다. 입력하지 않은 경험은 만들지 않도록 처리합니다.
        </p>
      </div>

      <div className="btn-row">
        <button
          type="button"
          className="btn btn--primary btn--lg"
          onClick={handleNext}
          disabled={(isLinkMode ? !productUrl.trim() : images.length === 0) || busy}
        >
          {primaryLabel}
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

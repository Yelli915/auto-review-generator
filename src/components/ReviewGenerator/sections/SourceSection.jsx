import { useId, useRef, useState } from 'react'
import { MAX_REVIEW_IMAGE_COUNT } from '#shared/reviewCategories'
import ChoiceGroup from './ChoiceGroup'
import ImagePreviewGrid from './ImagePreviewGrid'
import AppIcon from '../AppIcon'
import { MAX_FILE_SIZE_MB } from '../utils/uploadImages'

const RATING_LABELS = ['', '매우 불만족', '불만족', '보통', '만족', '매우 만족']
const INPUT_MODE_OPTIONS = [
  { value: 'link', label: '상품 링크' },
  { value: 'image', label: '사진' },
]

function StarRating({ value, onChange, disabled, ratingLabels, labelledBy }) {
  const [hovered, setHovered] = useState(null)
  const display = hovered ?? value

  return (
    <div
      className="star-rating"
      role="group"
      aria-label={labelledBy ? undefined : '별점 선택'}
      aria-labelledby={labelledBy}
      onMouseLeave={() => setHovered(null)}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={`star${display >= star ? ' star--on' : ''}`}
          onMouseEnter={() => !disabled && setHovered(star)}
          onClick={() => onChange(star)}
          aria-label={`${star}점`}
          aria-pressed={value === star}
          disabled={disabled}
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

export default function SourceSection({
  category,
  canUseLink,
  isLinkMode,
  onInputModeChange,
  productUrl,
  onProductUrlChange,
  rating,
  onRatingChange,
  userExperience,
  onUserExperienceChange,
  upload,
  missingImageCount,
  disabled,
  details,
}) {
  const inputId = useId()
  const addInputRef = useRef(null)
  const busy = disabled || upload.busy
  const experiencePlaceholder = category === 'place'
    ? '예: 대기 시간이 조금 있었지만 좌석 간격이 넓고 조명이 편했어요. 직원 안내는 친절했어요.'
    : '예: 생각보다 작았지만 마감이 깔끔했어요. 향은 강하지 않았고, 포장은 살짝 아쉬웠어요.'
  const { images, status } = upload
  const dropClass = [
    'file-drop',
    images.length ? 'file-drop--ready' : '',
    upload.isDragging ? 'file-drop--drag' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section className="panel" aria-labelledby="section-source">
      <h2 className="panel__title" id="section-source">
        {isLinkMode ? '상품 링크를 알려주세요' : '사진으로 시작해요'}
      </h2>

      {canUseLink && (
        <ChoiceGroup
          legend="입력 방식"
          options={INPUT_MODE_OPTIONS}
          value={isLinkMode ? 'link' : 'image'}
          onChange={onInputModeChange}
          disabled={busy}
        />
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
            onChange={(e) => onProductUrlChange(e.target.value)}
            disabled={busy}
          />
          <p className="field__hint">
            공개 상품 페이지의 상품명, 브랜드, 가격, 옵션을 읽어 옵니다. 읽지 못한 정보는 다음 칸에서 직접 보완할 수 있습니다.
          </p>
        </div>
      ) : (
        <>
          {missingImageCount > 0 && !images.length && (
            <p className="notice" role="status">
              새로고침하면 사진은 비워집니다. 키워드와 리뷰는 그대로 이어서 쓸 수 있고, 키워드를 다시 만들려면 사진을 다시 올려 주세요.
            </p>
          )}
          <div className="upload-row">
            <div className="field upload-row__drop">
              <span className="field__label" id={`${inputId}-label`}>
                사진
              </span>
              <label
                className={dropClass}
                htmlFor={inputId}
                onDragOver={upload.handleDragOver}
                onDragLeave={upload.handleDragLeave}
                onDrop={upload.handleDrop}
              >
                <input
                  id={inputId}
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={busy}
                  onChange={upload.handleFileChange}
                  aria-labelledby={`${inputId}-label`}
                />
                {upload.isDragging ? (
                  <p className="file-drop__text file-drop__text--drag">여기에 놓으세요</p>
                ) : (
                  <>
                    <span className="file-drop__icon"><AppIcon name="photo" /></span>
                    <p className="file-drop__text">
                      {images.length ? '사진 다시 선택하기' : '사진을 추가해 주세요'}
                    </p>
                    <p className="file-drop__sub">
                      최대 {MAX_REVIEW_IMAGE_COUNT}장 · 사진당 {MAX_FILE_SIZE_MB}MB 이하
                    </p>
                  </>
                )}
              </label>
              {status.text && (
                <p className={`field__hint ${status.isError ? 'field__hint--error' : 'field__hint--file'}`}>
                  {status.text}
                </p>
              )}
            </div>

            <input
              ref={addInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              disabled={busy}
              onChange={(e) => upload.handleFileChange(e, { append: true })}
            />
            <ImagePreviewGrid
              images={images}
              isBusy={busy}
              onAdd={() => addInputRef.current?.click()}
              onRemove={upload.handleRemoveImage}
            />
          </div>

        </>
      )}

      {details}

      <div className="field">
        <span className="field__label" id={`${inputId}-rating`}>이번 경험은 어땠나요?</span>
        <StarRating
          value={rating}
          onChange={onRatingChange}
          disabled={busy}
          ratingLabels={RATING_LABELS}
          labelledBy={`${inputId}-rating`}
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor={`${inputId}-experience`}>
          짧은 경험 메모 <span className="field__label-note">선택</span>
        </label>
        <textarea
          id={`${inputId}-experience`}
          className="text-input"
          rows={3}
          maxLength={800}
          placeholder={experiencePlaceholder}
          value={userExperience}
          onChange={(e) => onUserExperienceChange(e.target.value)}
          disabled={busy}
        />
        <p className="field__hint">
          좋았던 점이나 아쉬웠던 점을 자유롭게 적어주세요.
        </p>
      </div>

    </section>
  )
}

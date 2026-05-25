import { MAX_REVIEW_IMAGE_COUNT } from '../../../../shared/reviewCategories'

export default function ImagePreviewGrid({
  images,
  isBusy,
  onAdd,
  onEdit,
  onRemove,
}) {
  if (!images.length) return null

  return (
    <section className="upload-preview upload-row__preview" aria-label="선택한 이미지 미리보기">
      <div className="upload-preview__header">
        <div>
          <h3 className="upload-preview__title">선택한 이미지</h3>
          <p className="upload-preview__count">
            {images.length}/{MAX_REVIEW_IMAGE_COUNT}장
          </p>
        </div>
      </div>

      <div className="preview-grid">
        {images.map((image, index) => (
          <div className="preview-frame preview-frame--thumb" key={image.previewUrl}>
            <button
              type="button"
              className="preview-frame__image-button"
              onClick={() => onEdit(index)}
              disabled={isBusy}
              aria-label={`${index + 1}번째 이미지 수정`}
            >
              <img
                src={image.editedPreviewUrl || image.previewUrl}
                alt={`선택한 이미지 ${index + 1}`}
              />
              <span className="preview-frame__edit">편집</span>
            </button>
            <button
              type="button"
              className="preview-frame__remove"
              onClick={() => onRemove(index)}
              disabled={isBusy}
              aria-label={`${index + 1}번째 이미지 삭제`}
            >
              ×
            </button>
          </div>
        ))}
        {images.length < MAX_REVIEW_IMAGE_COUNT && (
          <button
            type="button"
            className="preview-add"
            onClick={onAdd}
            disabled={isBusy}
            aria-label="이미지 추가"
          >
            <span className="preview-add__icon" aria-hidden="true">+</span>
            <span>추가</span>
          </button>
        )}
      </div>
    </section>
  )
}

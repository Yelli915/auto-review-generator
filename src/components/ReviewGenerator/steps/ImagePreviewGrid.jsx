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
    <div className="preview-grid upload-row__preview" aria-label="선택한 이미지 미리보기">
      {images.map((image, index) => (
        <div className="preview-frame preview-frame--thumb" key={image.previewUrl}>
          <img
            src={image.editedPreviewUrl || image.previewUrl}
            alt={`선택한 이미지 ${index + 1}`}
          />
          <button
            type="button"
            className="preview-frame__edit"
            onClick={() => onEdit(index)}
            disabled={isBusy}
            aria-label={`${index + 1}번째 이미지 편집`}
          >
            편집
          </button>
          <button
            type="button"
            className="preview-frame__remove"
            onClick={() => onRemove(index)}
            disabled={isBusy}
            aria-label={`${index + 1}번째 이미지 삭제`}
          >
            x
          </button>
        </div>
      ))}
      {images.length < MAX_REVIEW_IMAGE_COUNT && (
        <button
          type="button"
          className="preview-add"
          onClick={onAdd}
          disabled={isBusy}
        >
          사진 추가
        </button>
      )}
    </div>
  )
}

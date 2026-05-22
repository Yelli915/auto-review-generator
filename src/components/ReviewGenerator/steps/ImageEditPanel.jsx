import { useState } from 'react'
import { CROP_MODES, DEFAULT_IMAGE_EDIT, normalizeRotation } from '../utils/imageUtils'

const CROP_OPTIONS = [
  { value: CROP_MODES.original, label: '원본' },
  { value: CROP_MODES.square, label: '정사각형' },
  { value: CROP_MODES.ratio4x3, label: '4:3' },
  { value: CROP_MODES.free, label: '자유' },
]

const DEFAULT_FREE_CROP_RECT = {
  x: 0.08,
  y: 0.08,
  width: 0.84,
  height: 0.84,
}

const FREE_CROP_FIELDS = [
  { key: 'x', label: '왼쪽', min: 0, getMax: () => 90 },
  { key: 'y', label: '위', min: 0, getMax: () => 90 },
  { key: 'width', label: '너비', min: 10, getMax: (rect) => Math.round((1 - rect.x) * 100) },
  { key: 'height', label: '높이', min: 10, getMax: (rect) => Math.round((1 - rect.y) * 100) },
]

function cropRectKey(rect) {
  const safeRect = rect || DEFAULT_FREE_CROP_RECT
  return ['x', 'y', 'width', 'height']
    .map((key) => Math.round(safeRect[key] * 100))
    .join(':')
}

export default function ImageEditPanel({
  image,
  imageNumber,
  isBusy,
  onApply,
  onClose,
}) {
  const [rotation, setRotation] = useState(() => normalizeRotation(image?.rotation))
  const [cropMode, setCropMode] = useState(
    () => image?.cropMode || DEFAULT_IMAGE_EDIT.cropMode,
  )
  const [cropRect, setCropRect] = useState(
    () => image?.cropRect || DEFAULT_FREE_CROP_RECT,
  )

  if (!image) return null

  const savedRotation = normalizeRotation(image.rotation)
  const savedCropMode = image.cropMode || DEFAULT_IMAGE_EDIT.cropMode
  const safeCropRect = cropRect || DEFAULT_FREE_CROP_RECT
  const isShowingSavedEdit =
    Boolean(image.editedPreviewUrl) &&
    rotation === savedRotation &&
    cropMode === savedCropMode &&
    (
      cropMode !== CROP_MODES.free ||
      cropRectKey(safeCropRect) === cropRectKey(image.cropRect)
    )
  const previewSrc = isShowingSavedEdit ? image.editedPreviewUrl : image.previewUrl

  const rotate = (delta) => {
    setRotation((prev) => normalizeRotation(prev + delta))
  }

  const updateCropRect = (key, value) => {
    setCropRect((prev) => {
      const next = {
        ...(prev || DEFAULT_FREE_CROP_RECT),
        [key]: Number(value) / 100,
      }
      next.width = Math.max(0.1, Math.min(1 - next.x, next.width))
      next.height = Math.max(0.1, Math.min(1 - next.y, next.height))
      return next
    })
  }

  return (
    <div className="image-editor" role="region" aria-label={`${imageNumber}번째 이미지 편집`}>
      <div className="image-editor__header">
        <div>
          <p className="image-editor__title">{imageNumber}번째 사진 편집</p>
        </div>
        <button
          type="button"
          className="btn-link"
          onClick={onClose}
          disabled={isBusy}
        >
          닫기
        </button>
      </div>

      <div className="image-editor__body">
        <div className="image-editor__preview">
          <img
            src={previewSrc}
            alt={`${imageNumber}번째 이미지 편집 미리보기`}
            style={{ transform: isShowingSavedEdit ? undefined : `rotate(${rotation}deg)` }}
          />
          {cropMode === CROP_MODES.free && (
            <div
              className="image-editor__crop-box"
              aria-hidden="true"
              style={{
                left: `${safeCropRect.x * 100}%`,
                top: `${safeCropRect.y * 100}%`,
                width: `${safeCropRect.width * 100}%`,
                height: `${safeCropRect.height * 100}%`,
              }}
            />
          )}
        </div>

        <div className="image-editor__controls">
          <div className="image-editor__group" role="group" aria-label="이미지 회전">
            <span className="field__label">회전</span>
            <div className="image-editor__actions">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => rotate(-90)}
                disabled={isBusy}
              >
                왼쪽
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => rotate(90)}
                disabled={isBusy}
              >
                오른쪽
              </button>
            </div>
          </div>

          <div className="image-editor__group">
            <span className="field__label">비율</span>
            <div className="segmented" role="group" aria-label="이미지 자르기 비율">
              {CROP_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`segmented__item${cropMode === option.value ? ' is-active' : ''}`}
                  onClick={() => setCropMode(option.value)}
                  disabled={isBusy}
                  aria-pressed={cropMode === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {cropMode === CROP_MODES.free && (
            <div className="image-editor__group image-editor__free-crop">
              <span className="field__label">자유 자르기</span>
              {FREE_CROP_FIELDS.map((field) => (
                <label key={field.key}>
                  {field.label}
                  <input
                    type="range"
                    min={field.min}
                    max={field.getMax(safeCropRect)}
                    value={Math.round(safeCropRect[field.key] * 100)}
                    onChange={(e) => updateCropRect(field.key, e.target.value)}
                    disabled={isBusy}
                  />
                </label>
              ))}
            </div>
          )}

          <button
            type="button"
            className="btn btn--primary image-editor__apply"
            onClick={() =>
              onApply({
                rotation,
                cropMode,
                cropRect: cropMode === CROP_MODES.free ? safeCropRect : null,
              })
            }
            disabled={isBusy}
          >
            적용
          </button>
        </div>
      </div>
    </div>
  )
}

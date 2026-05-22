import { useRef, useState } from 'react'
import {
  CROP_MODES,
  DEFAULT_IMAGE_EDIT,
  areCropAreasEqual,
  calculateCropRect,
  createCropAreaFromPoints,
  normalizeCropArea,
  normalizeRotation,
} from '../utils/imageUtils'

const CROP_OPTIONS = [
  { value: CROP_MODES.original, label: '원본' },
  { value: CROP_MODES.square, label: '정사각형' },
  { value: CROP_MODES.ratio4x3, label: '4:3' },
  { value: CROP_MODES.free, label: '자유' },
]

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
  const [cropArea, setCropArea] = useState(() =>
    normalizeCropArea(image?.cropArea || DEFAULT_IMAGE_EDIT.cropArea),
  )
  const [naturalSize, setNaturalSize] = useState(null)
  const dragStartRef = useRef(null)

  if (!image) return null

  const savedRotation = normalizeRotation(image.rotation)
  const savedCropMode = image.cropMode || DEFAULT_IMAGE_EDIT.cropMode
  const savedCropArea = normalizeCropArea(image.cropArea || DEFAULT_IMAGE_EDIT.cropArea)
  const currentCropArea = normalizeCropArea(cropArea)
  const isShowingSavedEdit =
    Boolean(image.editedPreviewUrl) &&
    rotation === savedRotation &&
    cropMode === savedCropMode &&
    cropMode !== CROP_MODES.free &&
    areCropAreasEqual(currentCropArea, savedCropArea)
  const previewSrc = isShowingSavedEdit ? image.editedPreviewUrl : image.previewUrl
  const cropFrame =
    naturalSize && cropMode !== CROP_MODES.original
      ? calculateCropRect(
          naturalSize.width,
          naturalSize.height,
          cropMode,
          currentCropArea,
        )
      : null
  const cropFrameStyle = cropFrame
    ? {
        left: `${(cropFrame.x / naturalSize.width) * 100}%`,
        top: `${(cropFrame.y / naturalSize.height) * 100}%`,
        width: `${(cropFrame.width / naturalSize.width) * 100}%`,
        height: `${(cropFrame.height / naturalSize.height) * 100}%`,
      }
    : null

  const rotate = (delta) => {
    setRotation((prev) => normalizeRotation(prev + delta))
  }

  const handleImageLoad = (e) => {
    setNaturalSize({
      width: e.currentTarget.naturalWidth,
      height: e.currentTarget.naturalHeight,
    })
  }

  const getPointerArea = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    }
  }

  const handleCropPointerDown = (e) => {
    if (cropMode !== CROP_MODES.free || isBusy) return
    e.preventDefault()
    const start = getPointerArea(e)
    dragStartRef.current = start
    e.currentTarget.setPointerCapture(e.pointerId)
    setCropArea(createCropAreaFromPoints(start, start))
  }

  const handleCropPointerMove = (e) => {
    const start = dragStartRef.current
    if (!start || cropMode !== CROP_MODES.free || isBusy) return
    const current = getPointerArea(e)
    setCropArea(createCropAreaFromPoints(start, current))
  }

  const handleCropPointerUp = (e) => {
    dragStartRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  return (
    <div className="image-editor" role="region" aria-label={`${imageNumber}번째 이미지 편집`}>
      <div className="image-editor__preview">
        <div
          className={`image-editor__image-wrap${cropMode === CROP_MODES.free ? ' is-free-crop' : ''}`}
          onPointerDown={handleCropPointerDown}
          onPointerMove={handleCropPointerMove}
          onPointerUp={handleCropPointerUp}
          onPointerCancel={handleCropPointerUp}
        >
          <img
            src={previewSrc}
            alt={`${imageNumber}번째 이미지 편집 미리보기`}
            onLoad={handleImageLoad}
            style={{ transform: isShowingSavedEdit ? undefined : `rotate(${rotation}deg)` }}
            draggable={false}
          />
          {cropFrameStyle && (
            <div className="image-editor__crop-layer" aria-hidden="true">
              <div className="image-editor__crop-frame" style={cropFrameStyle} />
            </div>
          )}
        </div>
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
              왼쪽 90도
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => rotate(90)}
              disabled={isBusy}
            >
              오른쪽 90도
            </button>
          </div>
        </div>

        <div className="image-editor__group">
          <span className="field__label">자르기</span>
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
          {cropMode === CROP_MODES.free && (
            <p className="field__hint">
              미리보기 이미지 위에서 원하는 영역을 드래그해 선택하세요.
            </p>
          )}
        </div>
      </div>

      <div className="btn-row btn-row--tight btn-row--split">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => onApply({ rotation, cropMode, cropArea: currentCropArea })}
          disabled={isBusy}
        >
          적용
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={onClose}
          disabled={isBusy}
        >
          닫기
        </button>
      </div>
    </div>
  )
}

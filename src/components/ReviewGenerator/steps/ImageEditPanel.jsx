import { useRef, useState } from 'react'
import {
  CROP_MODES,
  DEFAULT_FREE_CROP_RECT,
  DEFAULT_IMAGE_EDIT,
  MIN_INTERACTIVE_CROP_SIZE,
  cropRectKey,
  normalizeInteractiveCropRect,
  normalizeRotation,
} from '../utils/imageUtils'

const CROP_OPTIONS = [
  { value: CROP_MODES.original, label: '원본' },
  { value: CROP_MODES.square, label: '정사각형' },
  { value: CROP_MODES.ratio4x3, label: '4:3' },
  { value: CROP_MODES.free, label: '자유' },
]

const CROP_HANDLES = ['nw', 'ne', 'sw', 'se']

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

export default function ImageEditPanel({
  image,
  imageNumber,
  isBusy,
  onApply,
  onClose,
}) {
  const cropCanvasRef = useRef(null)
  const cropDragRef = useRef(null)
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

  const getCropPoint = (event) => {
    const bounds = cropCanvasRef.current?.getBoundingClientRect()
    if (!bounds?.width || !bounds?.height) return null
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
      y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1),
    }
  }

  const beginCropDrag = (event, action) => {
    if (isBusy) return
    const point = getCropPoint(event)
    if (!point) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    cropDragRef.current = {
      action,
      pointerId: event.pointerId,
      startPoint: point,
      startRect: { ...safeCropRect },
    }
  }

  const dragCrop = (event) => {
    const drag = cropDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const point = getCropPoint(event)
    if (!point) return
    event.preventDefault()

    const dx = point.x - drag.startPoint.x
    const dy = point.y - drag.startPoint.y
    const rect = drag.startRect

    if (drag.action === 'move') {
      setCropRect(normalizeInteractiveCropRect({
        ...rect,
        x: clamp(rect.x + dx, 0, 1 - rect.width),
        y: clamp(rect.y + dy, 0, 1 - rect.height),
      }))
      return
    }

    const next = { ...rect }
    if (drag.action.includes('w')) {
      const nextX = clamp(
        rect.x + dx,
        0,
        rect.x + rect.width - MIN_INTERACTIVE_CROP_SIZE,
      )
      next.width = rect.width + rect.x - nextX
      next.x = nextX
    }
    if (drag.action.includes('e')) {
      next.width = clamp(
        rect.width + dx,
        MIN_INTERACTIVE_CROP_SIZE,
        1 - rect.x,
      )
    }
    if (drag.action.includes('n')) {
      const nextY = clamp(
        rect.y + dy,
        0,
        rect.y + rect.height - MIN_INTERACTIVE_CROP_SIZE,
      )
      next.height = rect.height + rect.y - nextY
      next.y = nextY
    }
    if (drag.action.includes('s')) {
      next.height = clamp(
        rect.height + dy,
        MIN_INTERACTIVE_CROP_SIZE,
        1 - rect.y,
      )
    }
    setCropRect(normalizeInteractiveCropRect(next))
  }

  const endCropDrag = (event) => {
    const drag = cropDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    cropDragRef.current = null
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
          <div className="image-editor__crop-canvas" ref={cropCanvasRef}>
            <img
              src={previewSrc}
              alt={`${imageNumber}번째 이미지 편집 미리보기`}
              style={{ transform: isShowingSavedEdit ? undefined : `rotate(${rotation}deg)` }}
            />
            {cropMode === CROP_MODES.free && (
              <div
                className="image-editor__crop-box"
                aria-label="자유 자르기 영역"
                role="group"
                tabIndex={0}
                style={{
                  left: `${safeCropRect.x * 100}%`,
                  top: `${safeCropRect.y * 100}%`,
                  width: `${safeCropRect.width * 100}%`,
                  height: `${safeCropRect.height * 100}%`,
                }}
                onPointerDown={(event) => beginCropDrag(event, 'move')}
                onPointerMove={dragCrop}
                onPointerUp={endCropDrag}
                onPointerCancel={endCropDrag}
              >
                {CROP_HANDLES.map((handle) => (
                  <span
                    key={handle}
                    className={`image-editor__crop-handle image-editor__crop-handle--${handle}`}
                    aria-hidden="true"
                    onPointerDown={(event) => beginCropDrag(event, handle)}
                  />
                ))}
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
            <div className="image-editor__group">
              <span className="field__label">자유 자르기</span>
              <p className="field__hint">박스를 마우스로 드래그하거나 모서리를 잡아 조절하세요.</p>
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

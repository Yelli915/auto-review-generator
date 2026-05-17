import { useState } from 'react'
import { CROP_MODES, DEFAULT_IMAGE_EDIT, normalizeRotation } from '../utils/imageUtils'

const CROP_OPTIONS = [
  { value: CROP_MODES.original, label: '원본' },
  { value: CROP_MODES.square, label: '정사각형' },
  { value: CROP_MODES.ratio4x3, label: '4:3' },
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

  if (!image) return null

  const previewSrc = image.previewUrl

  const rotate = (delta) => {
    setRotation((prev) => normalizeRotation(prev + delta))
  }

  return (
    <div className="image-editor" role="region" aria-label={`${imageNumber}번째 이미지 편집`}>
      <div className="image-editor__preview">
        <img
          src={previewSrc}
          alt={`${imageNumber}번째 이미지 편집 미리보기`}
          style={{ transform: `rotate(${rotation}deg)` }}
        />
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
        </div>
      </div>

      <div className="btn-row btn-row--tight btn-row--split">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => onApply({ rotation, cropMode })}
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

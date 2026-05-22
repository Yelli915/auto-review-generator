export const CROP_MODES = {
  original: 'original',
  square: 'square',
  ratio4x3: 'ratio4x3',
  free: 'free',
}

export const DEFAULT_IMAGE_EDIT = {
  rotation: 0,
  cropMode: CROP_MODES.original,
  cropRect: null,
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function toImageSize(value) {
  return Math.max(1, Math.round(Number(value) || 1))
}

export function normalizeRotation(value) {
  const n = Number.isFinite(Number(value)) ? Number(value) : 0
  return ((n % 360) + 360) % 360
}

function normalizeFreeCropRect(cropRect) {
  if (!cropRect || typeof cropRect !== 'object') return null
  const x = clamp(Number(cropRect.x) || 0, 0, 0.95)
  const y = clamp(Number(cropRect.y) || 0, 0, 0.95)
  const maxWidth = 1 - x
  const maxHeight = 1 - y
  return {
    x,
    y,
    width: clamp(Number(cropRect.width) || maxWidth, 0.05, maxWidth),
    height: clamp(Number(cropRect.height) || maxHeight, 0.05, maxHeight),
  }
}

export function calculateCropRect(
  width,
  height,
  cropMode = CROP_MODES.original,
  cropRect = null,
) {
  const w = toImageSize(width)
  const h = toImageSize(height)
  if (cropMode === CROP_MODES.free) {
    const rect = normalizeFreeCropRect(cropRect)
    if (!rect) return { x: 0, y: 0, width: w, height: h }
    const x = Math.min(w - 1, Math.round(w * rect.x))
    const y = Math.min(h - 1, Math.round(h * rect.y))
    return {
      x,
      y,
      width: clamp(Math.round(w * rect.width), 1, w - x),
      height: clamp(Math.round(h * rect.height), 1, h - y),
    }
  }
  if (cropMode === CROP_MODES.square) {
    const size = Math.min(w, h)
    return {
      x: Math.round((w - size) / 2),
      y: Math.round((h - size) / 2),
      width: size,
      height: size,
    }
  }
  if (cropMode === CROP_MODES.ratio4x3) {
    const target = 4 / 3
    const current = w / h
    if (current > target) {
      const nextWidth = Math.round(h * target)
      return {
        x: Math.round((w - nextWidth) / 2),
        y: 0,
        width: nextWidth,
        height: h,
      }
    }
    const nextHeight = Math.round(w / target)
    return {
      x: 0,
      y: Math.round((h - nextHeight) / 2),
      width: w,
      height: nextHeight,
    }
  }
  return { x: 0, y: 0, width: w, height: h }
}

export function calculateCanvasSize(width, height, rotation = 0) {
  const w = toImageSize(width)
  const h = toImageSize(height)
  const safeRotation = normalizeRotation(rotation)
  const isSideways = safeRotation === 90 || safeRotation === 270
  return {
    width: isSideways ? h : w,
    height: isSideways ? w : h,
  }
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('이미지 미리보기 생성 실패'))
      },
      'image/jpeg',
      quality,
    )
  })
}

export function transformImageFile(
  file,
  {
    maxEdge = 1280,
    quality = 0.85,
    rotation = DEFAULT_IMAGE_EDIT.rotation,
    cropMode = DEFAULT_IMAGE_EDIT.cropMode,
    cropRect = DEFAULT_IMAGE_EDIT.cropRect,
    createPreviewUrl = false,
  } = {},
) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = async () => {
      try {
        URL.revokeObjectURL(url)
        const crop = calculateCropRect(img.width, img.height, cropMode, cropRect)
        const longest = Math.max(crop.width, crop.height)
        const scale = longest > maxEdge ? maxEdge / longest : 1
        const w = Math.max(1, Math.round(crop.width * scale))
        const h = Math.max(1, Math.round(crop.height * scale))
        const safeRotation = normalizeRotation(rotation)
        const canvasSize = calculateCanvasSize(w, h, safeRotation)
        const canvas = document.createElement('canvas')
        canvas.width = canvasSize.width
        canvas.height = canvasSize.height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('canvas 2d를 사용할 수 없습니다'))
          return
        }
        ctx.save()
        if (safeRotation === 90) {
          ctx.translate(canvas.width, 0)
          ctx.rotate(Math.PI / 2)
        } else if (safeRotation === 180) {
          ctx.translate(canvas.width, canvas.height)
          ctx.rotate(Math.PI)
        } else if (safeRotation === 270) {
          ctx.translate(0, canvas.height)
          ctx.rotate((Math.PI * 3) / 2)
        }
        ctx.drawImage(
          img,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          0,
          0,
          w,
          h,
        )
        ctx.restore()
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        const i = dataUrl.indexOf(',')
        const base64 = i >= 0 ? dataUrl.slice(i + 1) : ''
        if (!base64) {
          reject(new Error('base64 인코딩 실패'))
          return
        }
        if (!createPreviewUrl) {
          resolve({ base64 })
          return
        }
        const blob = await canvasToBlob(canvas, quality)
        resolve({ base64, previewUrl: URL.createObjectURL(blob) })
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('이미지를 불러올 수 없습니다'))
    }
    img.src = url
  })
}

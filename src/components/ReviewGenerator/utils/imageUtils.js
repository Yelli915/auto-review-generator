export const CROP_MODES = {
  original: 'original',
  square: 'square',
  ratio4x3: 'ratio4x3',
  free: 'free',
}

export const DEFAULT_CROP_AREA = {
  x: 0.1,
  y: 0.1,
  width: 0.8,
  height: 0.8,
}

export const MIN_CROP_AREA_SIZE = 0.02

export const DEFAULT_IMAGE_EDIT = {
  rotation: 0,
  cropMode: CROP_MODES.original,
  cropArea: DEFAULT_CROP_AREA,
}

export function normalizeRotation(value) {
  const n = Number.isFinite(Number(value)) ? Number(value) : 0
  return ((n % 360) + 360) % 360
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function normalizeCropArea(cropArea = DEFAULT_CROP_AREA) {
  const x = clamp(Number(cropArea?.x) || 0, 0, 0.98)
  const y = clamp(Number(cropArea?.y) || 0, 0, 0.98)
  const width = clamp(
    Number(cropArea?.width) || DEFAULT_CROP_AREA.width,
    MIN_CROP_AREA_SIZE,
    1,
  )
  const height = clamp(
    Number(cropArea?.height) || DEFAULT_CROP_AREA.height,
    MIN_CROP_AREA_SIZE,
    1,
  )
  return {
    x,
    y,
    width: Math.min(width, 1 - x),
    height: Math.min(height, 1 - y),
  }
}

export function areCropAreasEqual(a, b) {
  const left = normalizeCropArea(a)
  const right = normalizeCropArea(b)
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  )
}

export function createCropAreaFromPoints(start, end) {
  const startX = Number(start?.x) || 0
  const startY = Number(start?.y) || 0
  const endX = Number(end?.x) || 0
  const endY = Number(end?.y) || 0
  return normalizeCropArea({
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.max(MIN_CROP_AREA_SIZE, Math.abs(endX - startX)),
    height: Math.max(MIN_CROP_AREA_SIZE, Math.abs(endY - startY)),
  })
}

export function calculateCropRect(
  width,
  height,
  cropMode = CROP_MODES.original,
  cropArea = DEFAULT_CROP_AREA,
) {
  const w = Math.max(1, Math.round(Number(width) || 1))
  const h = Math.max(1, Math.round(Number(height) || 1))
  if (cropMode === CROP_MODES.free) {
    const area = normalizeCropArea(cropArea)
    return {
      x: Math.round(w * area.x),
      y: Math.round(h * area.y),
      width: Math.max(1, Math.round(w * area.width)),
      height: Math.max(1, Math.round(h * area.height)),
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
  const w = Math.max(1, Math.round(Number(width) || 1))
  const h = Math.max(1, Math.round(Number(height) || 1))
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
    cropArea = DEFAULT_IMAGE_EDIT.cropArea,
    createPreviewUrl = false,
  } = {},
) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = async () => {
      try {
        URL.revokeObjectURL(url)
        const crop = calculateCropRect(img.width, img.height, cropMode, cropArea)
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

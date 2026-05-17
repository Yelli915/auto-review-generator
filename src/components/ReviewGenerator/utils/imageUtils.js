export const CROP_MODES = {
  original: 'original',
  square: 'square',
  ratio4x3: 'ratio4x3',
}

export const DEFAULT_IMAGE_EDIT = {
  rotation: 0,
  cropMode: CROP_MODES.original,
}

export function normalizeRotation(value) {
  const n = Number.isFinite(Number(value)) ? Number(value) : 0
  return ((n % 360) + 360) % 360
}

export function calculateCropRect(width, height, cropMode = CROP_MODES.original) {
  const w = Math.max(1, Math.round(Number(width) || 1))
  const h = Math.max(1, Math.round(Number(height) || 1))
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
    createPreviewUrl = false,
  } = {},
) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = async () => {
      try {
        URL.revokeObjectURL(url)
        const crop = calculateCropRect(img.width, img.height, cropMode)
        const longest = Math.max(crop.width, crop.height)
        const scale = longest > maxEdge ? maxEdge / longest : 1
        const w = Math.max(1, Math.round(crop.width * scale))
        const h = Math.max(1, Math.round(crop.height * scale))
        const safeRotation = normalizeRotation(rotation)
        const isSideways = safeRotation === 90 || safeRotation === 270
        const canvas = document.createElement('canvas')
        canvas.width = isSideways ? h : w
        canvas.height = isSideways ? w : h
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

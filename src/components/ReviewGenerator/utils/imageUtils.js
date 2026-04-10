export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function resizeAndConvertToBase64(
  file,
  { maxEdge = 1280, quality = 0.85 } = {},
) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        URL.revokeObjectURL(url)
        let { width, height } = img
        const longest = Math.max(width, height)
        const scale = longest > maxEdge ? maxEdge / longest : 1
        const w = Math.max(1, Math.round(width * scale))
        const h = Math.max(1, Math.round(height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('canvas 2d를 사용할 수 없습니다'))
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        const i = dataUrl.indexOf(',')
        const base64 = i >= 0 ? dataUrl.slice(i + 1) : ''
        if (!base64) {
          reject(new Error('base64 인코딩 실패'))
          return
        }
        resolve(base64)
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

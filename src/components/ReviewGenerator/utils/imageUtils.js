// 긴 변을 maxEdge 이하로 줄여 JPEG base64로 바꿉니다. 사진은 키워드 추출용이라 편집 기능은 두지 않습니다.
export function resizeImageFile(file, { maxEdge = 1280, quality = 0.85 } = {}) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('canvas 2d를 사용할 수 없습니다'))
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const base64 = canvas.toDataURL('image/jpeg', quality).split(',')[1] || ''
      if (base64) resolve(base64)
      else reject(new Error('base64 인코딩 실패'))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('이미지를 불러올 수 없습니다'))
    }
    img.src = url
  })
}

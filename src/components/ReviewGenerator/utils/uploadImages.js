import { MAX_REVIEW_IMAGE_COUNT } from '../../../../shared/reviewCategories'
import {
  DEFAULT_IMAGE_EDIT,
  transformImageFile,
} from './imageUtils'

export const MAX_FILE_SIZE_MB = 15
export const IMAGE_RESIZE_OPTIONS = { maxEdge: 448, quality: 0.68 }

function getExtensionFromMimeType(type) {
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  return 'jpg'
}

export function isImageFile(file) {
  if (!file) return false
  if (file.type?.startsWith('image/')) return true
  return /\.(avif|gif|jpe?g|png|webp)$/i.test(file.name || '')
}

function nameClipboardImage(file, index) {
  if (file.name) return file
  const extension = getExtensionFromMimeType(file.type)
  return new File([file], `pasted-image-${index + 1}.${extension}`, {
    type: file.type || 'image/jpeg',
    lastModified: Date.now(),
  })
}

export function getClipboardImageFiles(clipboardData) {
  if (!clipboardData) return []
  const itemFiles = Array.from(clipboardData.items || [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter(isImageFile)

  const files = itemFiles.length
    ? itemFiles
    : Array.from(clipboardData.files || []).filter(isImageFile)

  return files.map(nameClipboardImage)
}

export function isTextEditingTarget(target) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

export function validateSelectedFiles(files) {
  if (!files.length) return '이미지를 1장 이상 선택해 주세요.'
  if (files.length > MAX_REVIEW_IMAGE_COUNT) {
    return `이미지는 최대 ${MAX_REVIEW_IMAGE_COUNT}장까지 업로드할 수 있습니다.`
  }
  const invalidType = files.find((file) => !isImageFile(file))
  if (invalidType) return '이미지 파일(JPG, PNG 등)만 업로드할 수 있습니다.'
  const oversized = files.find((file) => file.size > MAX_FILE_SIZE_MB * 1024 * 1024)
  if (oversized) return `파일 크기는 각 ${MAX_FILE_SIZE_MB}MB 이하여야 합니다.`
  return ''
}

export function revokeObjectUrls(urls) {
  urls.forEach((url) => URL.revokeObjectURL(url))
}

export function getImageObjectUrls(images) {
  return images.flatMap((image) =>
    [image.previewUrl, image.editedPreviewUrl].filter(Boolean),
  )
}

export function getImageFileNames(images) {
  return images.map((image) => image.file.name).join(', ')
}

export function buildImageStatus(images, fallback = '') {
  return images.length ? getImageFileNames(images) : fallback
}

export async function createReviewImage(file, previewUrl) {
  const { base64 } = await transformImageFile(file, IMAGE_RESIZE_OPTIONS)
  return {
    file,
    previewUrl,
    base64Image: base64,
    mimeType: 'image/jpeg',
    ...DEFAULT_IMAGE_EDIT,
  }
}

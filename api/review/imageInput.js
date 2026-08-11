/* global Buffer */
import { MAX_REVIEW_IMAGE_COUNT } from '../../shared/reviewCategories.js'
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
} from './config.js'

function normalizeImageMimeType(value) {
  if (typeof value !== 'string' || !value.trim()) return 'image/jpeg'
  return value.trim().toLowerCase()
}

function hasExpectedImageSignature(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false
  if (mimeType === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  }
  if (mimeType === 'image/png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    )
  }
  if (mimeType === 'image/webp') {
    return (
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    )
  }
  return false
}

export function validateImageInput(imageBase64, rawMimeType) {
  const mimeType = normalizeImageMimeType(rawMimeType)
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    return {
      ok: false,
      status: 415,
      error: '지원하지 않는 이미지 형식입니다. JPG, PNG, WEBP만 업로드해 주세요.',
    }
  }
  if (typeof imageBase64 !== 'string' || !imageBase64.trim()) {
    return { ok: false, status: 400, error: 'imageBase64가 필요합니다.' }
  }

  const data = imageBase64.trim().replace(/\s+/g, '')
  if (
    data.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(data) ||
    /=[^=]/.test(data)
  ) {
    return {
      ok: false,
      status: 400,
      error: '이미지 데이터가 올바른 base64 형식이 아닙니다.',
    }
  }

  const decoded = Buffer.from(data, 'base64')
  if (!decoded.length) {
    return {
      ok: false,
      status: 400,
      error: '이미지 데이터를 읽을 수 없습니다.',
    }
  }
  if (decoded.length > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      status: 413,
      error: '이미지 크기가 너무 큽니다. 더 작은 이미지로 다시 시도해 주세요.',
    }
  }
  if (!hasExpectedImageSignature(decoded, mimeType)) {
    return {
      ok: false,
      status: 400,
      error: '이미지 형식과 실제 파일 내용이 일치하지 않습니다.',
    }
  }

  return { ok: true, imageBase64: data, mimeType }
}

export function validateImagesInput(images, fallbackImageBase64, fallbackMimeType) {
  const list = Array.isArray(images)
    ? images
    : [{ imageBase64: fallbackImageBase64, mimeType: fallbackMimeType }]
  if (list.length < 1) {
    return { ok: false, status: 400, error: '이미지를 1개 이상 선택해 주세요.' }
  }
  if (list.length > MAX_REVIEW_IMAGE_COUNT) {
    return {
      ok: false,
      status: 400,
      error: `이미지는 최대 ${MAX_REVIEW_IMAGE_COUNT}개까지 업로드할 수 있습니다.`,
    }
  }

  const validImages = []
  for (const image of list) {
    const result = validateImageInput(image?.imageBase64, image?.mimeType)
    if (!result.ok) return result
    validImages.push({
      imageBase64: result.imageBase64,
      mimeType: result.mimeType,
    })
  }
  return { ok: true, images: validImages }
}

export function buildImageParts(images) {
  return images.map((image) => ({
    inline_data: {
      mime_type: image.mimeType,
      data: image.imageBase64,
    },
  }))
}

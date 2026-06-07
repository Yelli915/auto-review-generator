import { useCallback, useEffect, useRef, useState } from 'react'
import { transformImageFile } from '../utils/imageUtils'
import {
  IMAGE_RESIZE_OPTIONS,
  buildImageStatus,
  createReviewImage,
  getClipboardImageFiles,
  getImageFileNames,
  getImageObjectUrls,
  isTextEditingTarget,
  revokeObjectUrls,
  validateSelectedFiles,
} from '../utils/uploadImages'

export function useUploadImages({ isLoading, isLinkMode, switchToImageMode }) {
  const [images, setImages] = useState([])
  const [status, setStatus] = useState({ text: '', isError: false })
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [editingIndex, setEditingIndex] = useState(null)
  const objectUrlsRef = useRef([])
  const processTokenRef = useRef(0)
  const busy = isLoading || isProcessing

  useEffect(() => {
    return () => {
      processTokenRef.current += 1
      revokeObjectUrls(objectUrlsRef.current)
      objectUrlsRef.current = []
    }
  }, [])

  const setTrackedImages = useCallback((nextImages, { revokePrevious = false } = {}) => {
    if (revokePrevious) revokeObjectUrls(objectUrlsRef.current)
    objectUrlsRef.current = getImageObjectUrls(nextImages)
    setImages(nextImages)
  }, [])

  const processFiles = useCallback((fileList, sourceLabel = '선택됨') => {
    const token = processTokenRef.current + 1
    processTokenRef.current = token
    const files = Array.from(fileList || [])
    const validationError = validateSelectedFiles(files)
    if (validationError) {
      setIsProcessing(false)
      setStatus({ text: validationError, isError: true })
      return
    }

    const nextPreviewUrls = files.map((file) => URL.createObjectURL(file))
    setTrackedImages([], { revokePrevious: true })
    objectUrlsRef.current = nextPreviewUrls
    setEditingIndex(null)
    setIsProcessing(true)
    setStatus({ text: '', isError: false })

    Promise.all(
      files.map((file, index) =>
        createReviewImage(file, nextPreviewUrls[index]),
      ),
    )
      .then((nextImages) => {
        if (processTokenRef.current !== token) return
        setTrackedImages(nextImages)
        setStatus({
          text: `${nextImages.length}장 ${sourceLabel} · ${getImageFileNames(nextImages)}`,
          isError: false,
        })
      })
      .catch(() => {
        if (processTokenRef.current !== token) return
        setTrackedImages([], { revokePrevious: true })
        setStatus({ text: '이미지 변환에 실패했습니다.', isError: true })
      })
      .finally(() => {
        if (processTokenRef.current !== token) return
        setIsProcessing(false)
      })
  }, [setTrackedImages])

  const handleFileChange = useCallback((e) => {
    processFiles(e.target.files)
    e.target.value = ''
  }, [processFiles])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    processFiles(e.dataTransfer.files)
  }, [processFiles])

  const handleRemoveImage = useCallback((index) => {
    if (busy) return
    const nextImages = images.filter((_, i) => i !== index)
    revokeObjectUrls(getImageObjectUrls([images[index]]))
    setTrackedImages(nextImages)
    setEditingIndex((prev) => {
      if (prev == null) return null
      if (prev === index) return null
      return prev > index ? prev - 1 : prev
    })
    setStatus({
      text: buildImageStatus(nextImages),
      isError: false,
    })
  }, [busy, images, setTrackedImages])

  const handleApplyImageEdit = useCallback(async (editState) => {
    if (editingIndex == null || !images[editingIndex] || busy) return
    const index = editingIndex
    const image = images[index]
    setIsProcessing(true)
    setStatus({ text: '이미지 편집을 적용하는 중입니다.', isError: false })
    try {
      const result = await transformImageFile(image.file, {
        ...IMAGE_RESIZE_OPTIONS,
        ...editState,
        createPreviewUrl: true,
      })
      if (image.editedPreviewUrl) URL.revokeObjectURL(image.editedPreviewUrl)
      const nextImages = images.map((item, i) =>
        i === index
          ? {
              ...item,
              ...editState,
              base64Image: result.base64,
              editedPreviewUrl: result.previewUrl || '',
            }
          : item,
      )
      setTrackedImages(nextImages)
      setStatus({ text: `${index + 1}번째 이미지 편집을 적용했습니다.`, isError: false })
    } catch {
      setStatus({ text: '이미지 편집 적용에 실패했습니다.', isError: true })
    } finally {
      setIsProcessing(false)
    }
  }, [busy, editingIndex, images, setTrackedImages])

  const handlePaste = useCallback((e) => {
    if (busy) return
    const pastedFiles = getClipboardImageFiles(e.clipboardData)
    if (!pastedFiles.length) {
      if (isTextEditingTarget(e.target)) return
      return
    }
    e.preventDefault()
    if (isLinkMode) switchToImageMode?.()
    processFiles(pastedFiles, '붙여넣음')
  }, [busy, isLinkMode, processFiles, switchToImageMode])

  useEffect(() => {
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [handlePaste])

  return {
    busy,
    editingIndex,
    handleApplyImageEdit,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileChange,
    handleRemoveImage,
    images,
    isDragging,
    isProcessing,
    setEditingIndex,
    setStatus,
    status,
  }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createReviewImage,
  getClipboardImageFiles,
  getImageFileNames,
  getImageObjectUrls,
  revokeObjectUrls,
  validateSelectedFiles,
} from '../utils/uploadImages'

export function useUploadImages({ isLoading, isLinkMode, pasteEnabled, switchToImageMode }) {
  const [images, setImages] = useState([])
  const [status, setStatus] = useState({ text: '', isError: false })
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
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
    setStatus({
      text: getImageFileNames(nextImages),
      isError: false,
    })
  }, [busy, images, setTrackedImages])

  const handlePaste = useCallback((e) => {
    // 사진 칸이 안 보이거나 글을 쓰는 중이면, 보이지 않는 곳에서 사진이 바뀌지 않도록 무시합니다.
    if (busy || !pasteEnabled || e.target.closest?.('input, textarea')) return
    const pastedFiles = getClipboardImageFiles(e.clipboardData)
    if (!pastedFiles.length) return
    e.preventDefault()
    if (isLinkMode) switchToImageMode?.()
    processFiles(pastedFiles, '붙여넣음')
  }, [busy, isLinkMode, pasteEnabled, processFiles, switchToImageMode])

  useEffect(() => {
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [handlePaste])

  return {
    busy,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileChange,
    handleRemoveImage,
    images,
    isDragging,
    isProcessing,
    status,
  }
}

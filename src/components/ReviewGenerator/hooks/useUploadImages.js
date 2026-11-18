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
  const pendingUrlsRef = useRef(null)
  const busy = isLoading || isProcessing

  useEffect(() => {
    return () => {
      revokeObjectUrls(pendingUrlsRef.current || [])
      pendingUrlsRef.current = null
      revokeObjectUrls(objectUrlsRef.current)
      objectUrlsRef.current = []
    }
  }, [])

  const setTrackedImages = useCallback((nextImages, { revokePrevious = false } = {}) => {
    if (revokePrevious) revokeObjectUrls(objectUrlsRef.current)
    objectUrlsRef.current = getImageObjectUrls(nextImages)
    setImages(nextImages)
  }, [])

  const processFiles = useCallback(async (fileList, { append = false, sourceLabel = '선택됨' } = {}) => {
    if (busy || pendingUrlsRef.current) return
    const files = Array.from(fileList || [])
    const validationError = validateSelectedFiles(files, append ? images.length : 0)
    if (validationError) {
      setStatus({ text: validationError, isError: true })
      return
    }

    const previewUrls = []
    pendingUrlsRef.current = previewUrls
    setIsProcessing(true)
    setStatus({ text: '', isError: false })

    try {
      for (const file of files) previewUrls.push(URL.createObjectURL(file))
      const converted = await Promise.all(files.map((file, index) => createReviewImage(file, previewUrls[index])))
      if (pendingUrlsRef.current !== previewUrls) return
      const nextImages = append ? [...images, ...converted] : converted
      setTrackedImages(nextImages, { revokePrevious: !append })
      setStatus({
        text: `${nextImages.length}장 ${sourceLabel} · ${getImageFileNames(nextImages)}`,
        isError: false,
      })
    } catch {
      if (pendingUrlsRef.current === previewUrls) {
        revokeObjectUrls(previewUrls)
        setStatus({ text: '이미지 변환에 실패했습니다.', isError: true })
      }
    } finally {
      if (pendingUrlsRef.current === previewUrls) {
        pendingUrlsRef.current = null
        setIsProcessing(false)
      }
    }
  }, [busy, images, setTrackedImages])

  const handleFileChange = useCallback((e, options) => {
    if (e.target.files?.length) processFiles(e.target.files, options)
    e.target.value = ''
  }, [processFiles])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    if (!busy) setIsDragging(true)
  }, [busy])

  const handleDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    processFiles(e.dataTransfer.files)
  }, [processFiles])

  const handleRemoveImage = useCallback((index) => {
    if (busy || pendingUrlsRef.current) return
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
    processFiles(pastedFiles, { sourceLabel: '붙여넣음' })
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
    isDragging: isDragging && !busy,
    isProcessing,
    status,
  }
}

import { useEffect, useRef, useState } from 'react'

// 오류 안내·안전 영역·글자 확대를 포함한 하단 버튼 높이만큼 본문 여백을 확보합니다.
export function useActionBarHeight(view) {
  const ref = useRef(null)
  const [height, setHeight] = useState(180)
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setHeight(entry.target.getBoundingClientRect().height))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [view])
  return { ref, height }
}

import { useState } from 'react'
import { createReviewVersionState, openReviewVersion } from '../utils/reviewVersions'

// 리뷰 버전(v1, v2…) 목록과 보고 있는 버전입니다. 최대 10개를 보관하고 넘치면 가장 오래된 것부터 버립니다.
export function useReviewVersions(draft) {
  const [state, setState] = useState(() => createReviewVersionState(draft))

  // 빈 버전을 맨 뒤에 열고 선택합니다. 돌려주는 함수를 부르면 잘려 나간 가장 오래된 버전과 선택까지 그대로 되돌립니다.
  const openVersion = (fields) => {
    const previous = state
    setState(openReviewVersion(previous, fields))
    return () => setState(previous)
  }

  const setActiveVersion = (value) => setState((prev) => ({
    ...prev,
    activeVersion: typeof value === 'function' ? value(prev.activeVersion) : value,
  }))

  const setLatestText = (text) => {
    setState((prev) => ({ ...prev, versions: prev.versions.map((v, i) => i === prev.versions.length - 1 ? { ...v, text } : v) }))
  }

  const editActiveVersion = (text) => {
    setState((prev) => ({ ...prev, versions: prev.versions.map((v, i) => i === prev.activeVersion ? { ...v, text } : v) }))
  }

  return { ...state, setActiveVersion, openVersion, setLatestText, editActiveVersion }
}

import { useState } from 'react'

const MAX_VERSIONS = 10

// 리뷰 버전(v1, v2…) 목록과 보고 있는 버전입니다. 최대 MAX_VERSIONS개를 보관하고 넘치면 가장 오래된 것부터 버립니다.
export function useReviewVersions(draft) {
  const [versions, setVersions] = useState(draft?.versions || [])
  const [activeVersion, setActiveVersion] = useState(() =>
    Math.min(draft?.activeVersion || 0, Math.max(0, (draft?.versions?.length || 1) - 1)),
  )

  // 빈 버전을 맨 뒤에 열고 선택합니다. 돌려주는 함수를 부르면 잘려 나간 가장 오래된 버전과 선택까지 그대로 되돌립니다.
  const openVersion = (fields) => {
    const previousVersions = versions
    const previousActive = activeVersion
    const kept = versions.slice(-(MAX_VERSIONS - 1))
    setVersions([...kept, { n: (versions.at(-1)?.n || 0) + 1, text: '', ...fields }])
    setActiveVersion(kept.length)
    return () => {
      setVersions(previousVersions)
      setActiveVersion(previousActive)
    }
  }

  const setLatestText = (text) => {
    setVersions((prev) => prev.map((v, i) => (i === prev.length - 1 ? { ...v, text } : v)))
  }

  const editActiveVersion = (text) => {
    setVersions((prev) => prev.map((v, i) => (i === activeVersion ? { ...v, text } : v)))
  }

  return { versions, activeVersion, setActiveVersion, openVersion, setLatestText, editActiveVersion }
}

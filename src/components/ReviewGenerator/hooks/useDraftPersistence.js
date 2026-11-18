import { useEffect, useState } from 'react'
import { createDraftPersistence } from '../utils/draftPersistence'
import { saveDraft } from '../utils/draftStorage'

export function useDraftPersistence({ state, versions, activeVersion, imageCount, isGenerating }) {
  const [persistence] = useState(() => createDraftPersistence(saveDraft))

  useEffect(() => {
    persistence.update({ ...state, versions, activeVersion, imageCount }, isGenerating)
    return persistence.cancelTimer
  }, [state, versions, activeVersion, imageCount, isGenerating, persistence])

  useEffect(() => {
    window.addEventListener('pagehide', persistence.flush)
    return () => {
      window.removeEventListener('pagehide', persistence.flush)
      // 초기화로 작업 공간이 사라질 때 이전 초안을 다시 저장하지 않습니다.
      persistence.dispose()
    }
  }, [persistence])
}

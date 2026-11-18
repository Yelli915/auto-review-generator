import { useEffect, useState } from 'react'
import { generateReview } from '../services/geminiService'
import { loadReviewUsage, saveReviewUsage } from '../utils/draftStorage'
import { buildReviewGeneration, runReviewGeneration } from '../utils/reviewGeneration'

export function useReviewGeneration({ input, versionState, runTask, onVersionOpened }) {
  const [usage, setUsage] = useState(loadReviewUsage)
  useEffect(() => {
    if (!usage) return
    const timer = setTimeout(() => setUsage(null), Math.max(0, usage.resetAt - Date.now()))
    return () => clearTimeout(timer)
  }, [usage])

  const writeReview = async (rewriteAction = null, onStart) => {
    const base = versionState.versions[versionState.activeVersion]
    if (rewriteAction ? !base?.text.trim() : !input.sourceData) return false

    return runTask('review', () => runReviewGeneration({
      ...buildReviewGeneration(input, base, rewriteAction),
      openVersion: versionState.openVersion,
      generate: generateReview,
      onChunk: versionState.setLatestText,
      onOpened: onVersionOpened,
      onUsage: (next) => {
        setUsage(next)
        saveReviewUsage(next)
      },
    }), '리뷰 생성에 실패했습니다.', onStart)
  }

  return { writeReview, reviewsRemaining: usage?.remaining ?? null }
}

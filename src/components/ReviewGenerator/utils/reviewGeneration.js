import { normalizeReviewCategory, normalizeReviewSubcategory } from '#shared/reviewCategories'
import { normalizeReviewRating } from '#shared/reviewOptions'
import { buildEvidenceContext } from './workspaceContext.js'

function getOriginalContext(version, fallback) {
  if (version.generationContext) return version.generationContext

  // 이전 저장본에는 근거 문구와 끝줄 별점만 남아 있습니다.
  const evidence = version.evidence?.trim() || ''
  const savedRating = /(?:^|\n)별점: ([1-5](?:\.\d+)?)점$/.exec(evidence)
  return {
    ...fallback,
    rating: savedRating ? normalizeReviewRating(savedRating[1]) : fallback.rating,
    productContext: savedRating ? evidence.slice(0, savedRating.index).trim() : evidence,
  }
}

export function buildReviewGeneration(input, base, rewriteAction) {
  const { sourceData, userExperience, rating, selectedKeywords, length, tone } = input
  const original = rewriteAction ? base : null
  const basis = {
    keywords: original?.keywords?.length ? original.keywords : selectedKeywords,
    length: original?.length || length,
    tone: original?.tone || tone,
  }
  const category = normalizeReviewCategory(sourceData?.category ?? input.category)
  const sourceOptions = {
    category,
    subcategory: normalizeReviewSubcategory(category, sourceData?.subcategory ?? input.subcategory),
    rating: normalizeReviewRating(rating),
  }
  const generationContext = original
    ? getOriginalContext(original, sourceOptions)
    : { ...sourceOptions, productContext: buildEvidenceContext({ ...sourceData, userExperience }) }
  return {
    fields: {
      generationContext,
      note: rewriteAction?.label || '',
      from: original?.n,
      ...basis,
    },
    request: {
      ...generationContext,
      ...basis,
      previousReview: original?.text.trim() || '',
      rewriteInstruction: rewriteAction?.instruction || '',
    },
  }
}

// 버전 추가부터 스트리밍 종료까지 한 작업입니다. 실패 시 목록과 선택을 함께 되돌립니다.
export async function runReviewGeneration({ fields, request, openVersion, generate, onChunk, onUsage, onOpened }) {
  const rollback = openVersion(fields)
  let succeeded = false
  try {
    onOpened?.()
    await generate({ ...request, onChunk, onUsage })
    succeeded = true
    return true
  } finally {
    if (!succeeded) rollback()
  }
}

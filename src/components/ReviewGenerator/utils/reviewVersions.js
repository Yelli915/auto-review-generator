const MAX_VERSIONS = 10

export function getReviewEvidence(version) {
  const context = version?.generationContext
  return context ? `${context.productContext}\n별점: ${context.rating}점` : version?.evidence || ''
}

export function createReviewVersionState(draft) {
  return {
    versions: draft?.versions || [],
    activeVersion: Math.min(draft?.activeVersion || 0, Math.max(0, (draft?.versions?.length || 1) - 1)),
  }
}

export function openReviewVersion(previous, fields) {
  const kept = previous.versions.slice(-(MAX_VERSIONS - 1))
  return {
    versions: [...kept, { n: (previous.versions.at(-1)?.n || 0) + 1, text: '', ...fields }],
    activeVersion: kept.length,
  }
}

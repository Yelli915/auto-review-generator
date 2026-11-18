export const DRAFT_KEY = 'auto-review-generator:draft'

export function createReviewDraft({ versionCount = 2, activeVersion = versionCount ? versionCount - 1 : 0 } = {}) {
  return {
    v: 1,
    category: 'place',
    subcategory: 'cafe',
    inputMode: 'image',
    rating: 4,
    userExperience: '좌석이 넓어 편하게 쉬었어요.',
    sourceData: { category: 'place', subcategory: 'cafe', productContext: '' },
    keywords: ['넓은 좌석', '편안한 조명'],
    customKeywords: ['조용한 음악'],
    selectedKeywords: ['넓은 좌석', '조용한 음악'],
    length: 'medium',
    tone: 'friendly',
    versions: Array.from({ length: versionCount }, (_, index) => ({
      n: index + 1,
      text: `넓은 좌석에서 편하게 쉬었습니다. ${index + 1}`,
      keywords: ['넓은 좌석'],
      evidence: '넓은 좌석',
      length: 'short',
      tone: 'neutral',
    })),
    activeVersion,
  }
}

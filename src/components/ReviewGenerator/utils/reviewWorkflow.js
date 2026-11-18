// 저장된 초안은 입력·키워드·결과 중 실제로 이어 쓸 수 있는 단계에서 엽니다.
export function getResumeView(workspace) {
  if (workspace.versions.length) return 'draft'
  return workspace.hasSource ? 'keywords' : 'compose'
}

export function hasWorkspaceContent(workspace) {
  return Boolean(
    workspace.versions.length || workspace.hasSource ||
    workspace.upload.images.length || workspace.upload.isProcessing || workspace.missingImageCount > 0 ||
    workspace.productUrl.trim() || workspace.userExperience.trim() || workspace.productAnalysis ||
    workspace.subcategory || workspace.category !== 'place' || workspace.rating !== 5,
  )
}

export function getComposeAction(workspace) {
  if (workspace.isLinkMode && (!workspace.productAnalysis || workspace.productUrlChanged)) {
    return {
      kind: 'analyze',
      label: workspace.productAnalysis ? '바뀐 링크로 다시 분석하기' : '상품 정보 가져오기',
      disabled: !workspace.productUrl.trim(),
      hint: '상품 정보를 확인한 다음 키워드를 추천받아요.',
    }
  }
  if (workspace.hasSource && !workspace.keywordsStale) {
    return { kind: 'continue', label: '키워드 선택으로', disabled: false, hint: '추천받은 키워드로 이어서 작성해요.' }
  }
  return {
    kind: 'build',
    label: workspace.hasSource ? '키워드 다시 추천받기' : '키워드 추천받기',
    disabled: !workspace.canBuildKeywords,
    hint: workspace.isLinkMode
      ? workspace.canBuildKeywords ? '확인한 상품 정보로 키워드를 만들어요.' : '상품명 또는 특징을 입력하고 옵션을 확인해 주세요.'
      : workspace.canBuildKeywords ? '사진과 경험을 바탕으로 키워드를 만들어요.' : '사진을 한 장 이상 추가해 주세요.',
  }
}

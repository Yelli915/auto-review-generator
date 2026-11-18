export const REVIEW_REWRITE_ACTIONS = [
  { id: 'natural', label: '더 자연스럽게', instruction: '문장을 더 자연스럽고 실제 후기처럼 다듬어 주세요.' },
  { id: 'less-ad', label: '광고 느낌 줄이기', instruction: '광고 문구처럼 보이는 표현을 줄이고 담백한 사용 후기로 바꿔 주세요.' },
  { id: 'shorter', label: '짧게 줄이기', instruction: '핵심 경험은 유지하되 더 짧고 간결하게 줄여 주세요.' },
]

export const CUSTOM_INSTRUCTION_MAX = 300

export function createPickedRewrite(picked, mode) {
  return mode === 'swap'
    ? {
        label: `"${picked.word}" 바꿈`,
        instruction: `리뷰에서 "${picked.word}" 부분만 같은 뜻의 다른 자연스러운 표현으로 바꾸고, 나머지 문장은 최대한 그대로 두세요.`,
      }
    : {
        label: `"${picked.keyword}" 뺌`,
        instruction: `리뷰에서 "${picked.keyword}"에 관한 내용만 빼고, 나머지 문장은 최대한 그대로 두세요.`,
      }
}

export function createMissingKeywordsRewrite(keywords) {
  return {
    label: '빠진 키워드 넣기',
    instruction: `리뷰에 "${keywords.join('", "')}" 내용이 자연스럽게 들어가도록 보완하고, 나머지 문장은 최대한 그대로 두세요.`,
  }
}

export function createUnsupportedRewrite(tokens) {
  return {
    label: '근거 없는 내용 빼기',
    instruction: `리뷰에서 "${tokens.join('", "')}"처럼 입력 근거에 없는 숫자·이름이 들어간 내용만 빼고, 나머지 문장은 최대한 그대로 두세요.`,
  }
}

export function createCustomRewrite(value) {
  const instruction = value.trim()
  return { label: `요청: ${Array.from(instruction).slice(0, 20).join('')}`, instruction }
}

// 성공한 요청만 비웁니다. runTask가 실패를 알리면 사용자가 입력한 문장을 유지합니다.
export async function submitCustomRewrite(value, onRewrite) {
  if (!value.trim()) return value
  return await onRewrite(createCustomRewrite(value)) ? '' : value
}

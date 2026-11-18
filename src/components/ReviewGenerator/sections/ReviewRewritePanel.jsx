import { useId, useState } from 'react'
import { REVIEW_REWRITE_ACTIONS, CUSTOM_INSTRUCTION_MAX, submitCustomRewrite } from '../utils/rewriteActions'

export default function ReviewRewritePanel({ canAct, disabled, isStreaming, onRewrite }) {
  const [customInstruction, setCustomInstruction] = useState('')
  const customInstructionId = useId()
  const rewriteCustom = async () => {
    if (!customInstruction.trim() || !canAct) return
    setCustomInstruction(await submitCustomRewrite(customInstruction, onRewrite))
  }

  return (
    <div className="rewrite">
      <p className="field__label">이 버전 다듬기</p>
      <div className="rewrite__actions">
        {REVIEW_REWRITE_ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            className="chip chip--action"
            onClick={() => onRewrite(action)}
            disabled={!canAct}
          >
            {action.label}
          </button>
        ))}
      </div>
      <label className="visually-hidden" htmlFor={customInstructionId}>다듬기 요청 직접 쓰기</label>
      <div className="keyword-add__row">
        <input
          id={customInstructionId}
          className="text-input"
          value={customInstruction}
          maxLength={CUSTOM_INSTRUCTION_MAX}
          placeholder="예: 가격 얘기는 빼 주세요"
          disabled={disabled || isStreaming}
          onChange={(e) => setCustomInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              rewriteCustom()
            }
          }}
        />
        <button
          type="button"
          className="btn btn--secondary keyword-add__button"
          onClick={rewriteCustom}
          disabled={!canAct || !customInstruction.trim()}
        >
          다듬기
        </button>
      </div>
      <p className="field__hint">내용은 유지하고 표현만 바꿔 새 버전으로 남깁니다.</p>
    </div>
  )
}

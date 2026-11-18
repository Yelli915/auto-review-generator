import { useState } from 'react'
import { findUnsupportedTokens } from '#shared/evidenceCheck'
import { getReviewMinChars } from '#shared/reviewOptions'
import { findMissingKeywords, splitKeywordHighlights } from '../utils/keywordHighlight'
import { getReviewEvidence } from '../utils/reviewVersions'
import { createPickedRewrite, createMissingKeywordsRewrite, createUnsupportedRewrite } from '../utils/rewriteActions'

export default function ReviewContent({ version, isStreaming, canAct, onEdit, onRewrite }) {
  const [isEditing, setIsEditing] = useState(false)
  const [picked, setPicked] = useState(null)
  const text = version?.text || ''
  const trimmed = text.trim()
  const minChars = version ? getReviewMinChars(version.length) : 0
  const segments = splitKeywordHighlights(text, version?.keywords)
  const hasHighlights = segments.some((segment) => segment.keyword)
  // 편집 중에는 결과를 보여 주지 않으므로 키를 누를 때마다 다시 계산하지 않습니다.
  const missingKeywords = isStreaming || isEditing ? [] : findMissingKeywords(text, version?.keywords)
  // 입력(상품 정보·직접 경험·키워드)에 없는 숫자·영문은 모델이 지어냈을 수 있어 확인을 요청합니다.
  const unsupportedTokens = isStreaming || isEditing
    ? []
    : findUnsupportedTokens(text, [getReviewEvidence(version), ...(version?.keywords || [])].join('\n'))

  const rewrite = (action) => {
    setPicked(null)
    setIsEditing(false)
    return onRewrite(action)
  }

  return (
    <>
      {isEditing && !isStreaming ? (
        <>
          <label className="visually-hidden" htmlFor="review-output">생성된 리뷰 고치기</label>
          <textarea
            id="review-output"
            className="review-output"
            value={text}
            onChange={(e) => onEdit(e.target.value)}
            rows={10}
            autoFocus
          />
        </>
      ) : (
        <div className="review-output review-draft" aria-live="polite" aria-busy={isStreaming}>
          {!trimmed && isStreaming && (
            <span className="review-draft__placeholder">리뷰를 작성하는 중입니다...</span>
          )}
          {segments.map((segment, index) =>
            segment.keyword ? (
              <button
                key={index}
                type="button"
                className="review-mark"
                aria-pressed={picked?.index === index}
                aria-label={`${segment.text}, 키워드 ${segment.keyword}`}
                onClick={() =>
                  setPicked(picked?.index === index
                    ? null
                    : { index, word: segment.text, keyword: segment.keyword })
                }
                disabled={!canAct}
              >
                {segment.text}
              </button>
            ) : (
              <span key={index}>{segment.text}</span>
            ),
          )}
          {isStreaming && <span className="review-cursor" aria-hidden="true" />}
        </div>
      )}

      {picked && !isEditing && (
        <div className="mark-actions" role="group" aria-label={`"${picked.word}" 수정`}>
          <span className="mark-actions__label">
            <strong>{picked.word}</strong> · {picked.keyword}
          </span>
          <button type="button" className="chip chip--action" onClick={() => rewrite(createPickedRewrite(picked, 'swap'))} disabled={!canAct}>
            다른 표현으로
          </button>
          <button type="button" className="chip chip--action" onClick={() => rewrite(createPickedRewrite(picked, 'remove'))} disabled={!canAct}>
            이 내용 빼기
          </button>
          <button type="button" className="btn-link" onClick={() => setPicked(null)}>
            닫기
          </button>
        </div>
      )}

      <div className="review-meta">
        <p>
          <span className={trimmed.length < minChars ? 'review-meta__count is-short' : 'review-meta__count'}>
            {trimmed.length}자
          </span>
          {minChars > 0 && <span> · 최소 {minChars}자</span>}
          {version.note && <span> · {version.note}</span>}
        </p>
        <button
          type="button"
          className="btn-link review-meta__edit"
          onClick={() => {
            setPicked(null)
            setIsEditing((prev) => !prev)
          }}
          disabled={isStreaming}
        >
          {isEditing ? '완료' : '✎ 고치기'}
        </button>
      </div>
      {hasHighlights && !isEditing && !isStreaming && (
        <p className="field__hint review-hint">강조된 단어를 누르면 그 부분만 바꾸거나 뺄 수 있습니다.</p>
      )}
      {missingKeywords.length > 0 && !isEditing && (
        <div className="mark-actions" role="group" aria-label="빠진 키워드">
          <span className="mark-actions__label">
            빠진 키워드 · <strong>{missingKeywords.join(', ')}</strong>
          </span>
          <button type="button" className="chip chip--action" onClick={() => rewrite(createMissingKeywordsRewrite(missingKeywords))} disabled={!canAct}>
            넣어서 다듬기
          </button>
        </div>
      )}
      {unsupportedTokens.length > 0 && !isEditing && (
        <div className="mark-actions" role="group" aria-label="입력에 없는 내용">
          <span className="mark-actions__label">
            입력에 없는 내용 · <strong>{unsupportedTokens.join(', ')}</strong> · 실제와 맞는지 확인하세요
          </span>
          <button type="button" className="chip chip--action" onClick={() => rewrite(createUnsupportedRewrite(unsupportedTokens))} disabled={!canAct}>
            빼서 다듬기
          </button>
        </div>
      )}
    </>
  )
}

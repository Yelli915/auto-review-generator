import { useEffect, useRef, useState } from 'react'
import { getReviewMinChars } from '#shared/reviewOptions'
import { splitKeywordHighlights } from '../utils/keywordHighlight'

const REVIEW_REWRITE_ACTIONS = [
  { id: 'natural', label: '더 자연스럽게', instruction: '문장을 더 자연스럽고 실제 후기처럼 다듬어 주세요.' },
  { id: 'less-ad', label: '광고 느낌 줄이기', instruction: '광고 문구처럼 보이는 표현을 줄이고 담백한 사용 후기로 바꿔 주세요.' },
  { id: 'shorter', label: '짧게 줄이기', instruction: '핵심 경험은 유지하되 더 짧고 간결하게 줄여 주세요.' },
]

export default function ResultPanel({
  panelRef,
  versions,
  activeVersion,
  onSelectVersion,
  onEdit,
  isStreaming,
  canGenerate,
  onRegenerate,
  onRewrite,
  onReset,
  disabled,
  error,
}) {
  const [copyState, setCopyState] = useState('idle')
  const [isEditing, setIsEditing] = useState(false)
  const [picked, setPicked] = useState(null)
  const copyTimerRef = useRef(null)
  useEffect(() => () => clearTimeout(copyTimerRef.current), [])

  const version = versions[activeVersion]
  // 보이는 버전이 바뀌면(새로 생성·다듬기·탭 전환) 이전 버전 기준의 선택·편집 상태를 버립니다.
  const [shownVersion, setShownVersion] = useState(version?.n)
  if (shownVersion !== version?.n) {
    setShownVersion(version?.n)
    setPicked(null)
    setIsEditing(false)
  }
  const text = version?.text || ''
  const trimmed = text.trim()
  const minChars = version ? getReviewMinChars(version.length) : 0
  const canAct = !disabled && !isStreaming && Boolean(trimmed)
  const segments = splitKeywordHighlights(text, version?.keywords)
  const hasHighlights = segments.some((segment) => segment.keyword)

  const rewrite = (action) => {
    setPicked(null)
    setIsEditing(false)
    onRewrite(action)
  }

  const rewritePicked = (mode) => {
    const action = mode === 'swap'
      ? {
          label: `"${picked.word}" 바꿈`,
          instruction: `리뷰에서 "${picked.word}" 부분만 같은 뜻의 다른 자연스러운 표현으로 바꾸고, 나머지 문장은 최대한 그대로 두세요.`,
        }
      : {
          label: `"${picked.keyword}" 뺌`,
          instruction: `리뷰에서 "${picked.keyword}"에 관한 내용만 빼고, 나머지 문장은 최대한 그대로 두세요.`,
        }
    rewrite(action)
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
    clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopyState('idle'), 2000)
  }

  return (
    <section className="panel result-panel" aria-labelledby="section-result" ref={panelRef}>
      <h2 className="panel__title" id="section-result">
        초안
        {isStreaming && <span className="status-pill status-pill--ok">작성 중</span>}
      </h2>

      {versions.length > 1 && (
        <div className="version-tabs" role="group" aria-label="리뷰 버전">
          {versions.map((item, index) => (
            <button
              key={item.n}
              type="button"
              className="version-tab"
              aria-pressed={index === activeVersion}
              onClick={() => onSelectVersion(index)}
              disabled={isStreaming}
              title={item.note || '새로 생성'}
            >
              v{item.n}
            </button>
          ))}
        </div>
      )}

      {version ? (
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
              <button type="button" className="chip chip--action" onClick={() => rewritePicked('swap')} disabled={!canAct}>
                다른 표현으로
              </button>
              <button type="button" className="chip chip--action" onClick={() => rewritePicked('remove')} disabled={!canAct}>
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

          {error && <p className="banner banner--error" role="alert">{error}</p>}

          <div className="result-actions">
            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={handleCopy}
              disabled={!canAct}
            >
              {copyState === 'copied' ? '복사 완료' : copyState === 'failed' ? '복사 실패' : '복사하기'}
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--lg"
              onClick={() => onRegenerate()}
              disabled={disabled || !canGenerate}
            >
              새로 생성
            </button>
          </div>

          <div className="rewrite">
            <p className="field__label">이 버전 다듬기</p>
            <div className="rewrite__actions">
              {REVIEW_REWRITE_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className="chip chip--action"
                  onClick={() => rewrite(action)}
                  disabled={!canAct}
                >
                  {action.label}
                </button>
              ))}
            </div>
            <p className="field__hint">내용은 유지하고 표현만 바꿔 새 버전으로 남깁니다.</p>
          </div>
        </>
      ) : (
        <>
          {error && <p className="banner banner--error" role="alert">{error}</p>}
          <p className="panel__empty result-panel__empty">
            키워드를 고르고 리뷰를 생성하면 여기에 결과가 나타납니다. 다시 생성하거나 다듬은 결과는 버전으로 남습니다.
          </p>
        </>
      )}

      <button
        type="button"
        className="btn btn--ghost result-reset"
        onClick={onReset}
        disabled={disabled}
      >
        처음부터 다시 작성
      </button>
    </section>
  )
}

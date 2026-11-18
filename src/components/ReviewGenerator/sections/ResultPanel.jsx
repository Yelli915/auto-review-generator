import { useState } from 'react'
import AppIcon from '../AppIcon'
import ReviewContent from './ReviewContent'
import ReviewRewritePanel from './ReviewRewritePanel'

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
  const [confirmReset, setConfirmReset] = useState(false)
  const version = versions[activeVersion]
  const canAct = !disabled && !isStreaming && Boolean(version?.text.trim())
  // 다듬은 버전은 원본과, 새로 생성한 버전은 바로 앞 버전과 비교합니다.
  // 원본이 버전 개수 제한으로 잘려 나갔으면 다른 버전과 엉뚱하게 비교하지 않고 숨깁니다.
  const compareVersion = !version
    ? null
    : version.from === undefined
      ? versions[activeVersion - 1]
      : versions.find((item) => item.n === version.from)

  return (
    <section className="panel result-panel" aria-labelledby="section-result" ref={panelRef}>
      <h2 className="panel__title" id="section-result">
        {versions.length ? '나만의 리뷰 초안' : '리뷰를 완성하지 못했어요'}
        {isStreaming && <span className="status-pill status-pill--ok">작성 중</span>}
      </h2>

      {versions.length > 0 && (
        <div className="review-versions">
          <p className="field__label">이 리뷰의 버전 <span className="field__label-note">생성·수정 기록</span></p>
          <div className="version-tabs" role="group" aria-label="이 리뷰의 생성·수정 버전">
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
        </div>
      )}

      {version ? (
        <>
          <ReviewContent key={version.n} version={version} isStreaming={isStreaming} canAct={canAct} onEdit={onEdit} onRewrite={onRewrite} />
          {compareVersion && !isStreaming && (
            <details className="version-compare">
              <summary className="btn-link">v{compareVersion.n} 버전과 비교</summary>
              <p className="review-output version-compare__text">{compareVersion.text}</p>
            </details>
          )}

          {error && <p className="banner banner--error" role="alert">{error}</p>}

          <div className="result-tools">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => onRegenerate()}
              disabled={disabled || !canGenerate}
            >
              다른 초안 만들기
            </button>
          </div>

          <ReviewRewritePanel canAct={canAct} disabled={disabled} isStreaming={isStreaming} onRewrite={onRewrite} />
        </>
      ) : (
        <>
          {error && <p className="banner banner--error" role="alert">{error}</p>}
          <div className="empty-state">
            <span className="empty-state__icon"><AppIcon name="reviews" /></span>
            <h3>다시 시도할 수 있어요</h3>
            <p>키워드 선택으로 돌아가<br />리뷰를 다시 만들어 주세요.</p>
          </div>
        </>
      )}

      {version && (
        <button
          type="button"
          className={`btn btn--ghost result-reset${confirmReset ? ' is-confirm' : ''}`}
          // 모든 버전과 입력이 지워지므로 한 번 더 눌러야 실행합니다. 다른 곳을 누르면 취소됩니다.
          onClick={() => (confirmReset ? onReset() : setConfirmReset(true))}
          onBlur={() => setConfirmReset(false)}
          disabled={disabled}
        >
          {confirmReset ? '한 번 더 누르면 모든 버전과 입력이 지워집니다' : '처음부터 다시 작성'}
        </button>
      )}
    </section>
  )
}

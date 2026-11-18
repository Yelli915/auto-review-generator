import AppIcon from '../AppIcon'

export default function ReviewStepActions({ view, actionRef, workspace: ws, composeAction, onAdvance, onContinue, onGenerate, onCopy, copyStatus }) {
  const isBusy = Boolean(ws.busy)
  const composeError = ['analyze', 'keywords'].includes(ws.error?.scope) ? ws.error.message : ''
  const composeBusyLabel = ws.busy === 'analyze' ? '상품 정보를 가져오는 중…'
    : ws.busy === 'keywords' ? '키워드를 추천하는 중…' : ws.upload.isProcessing ? '사진을 준비하는 중…' : ''
  const activeVersion = ws.versions[ws.activeVersion]

  return (
    <footer ref={actionRef} className="flow-actions" aria-label="현재 단계 작업">
      {view === 'compose' && (
        <>
          {composeError && <p className="flow-actions__error" role="alert">{composeError}</p>}
          <p className="flow-actions__hint" role="status">{composeAction.hint}</p>
          {ws.hasSource && composeAction.kind !== 'continue' && <button type="button" className="btn-link" onClick={onContinue} disabled={isBusy}>기존 키워드로 계속하기</button>}
          <button type="button" className="btn btn--primary" onClick={onAdvance} disabled={isBusy || ws.upload.isProcessing || composeAction.disabled} aria-busy={isBusy || ws.upload.isProcessing}>
            {composeBusyLabel || composeAction.label}{!composeBusyLabel && <AppIcon name="arrow" />}
          </button>
        </>
      )}
      {view === 'keywords' && (
        <>
          <p className="flow-actions__hint" role="status">{ws.selectedKeywords.length ? `${ws.selectedKeywords.length}개 키워드로 나만의 리뷰를 만들어요.` : '리뷰에 담을 키워드를 한 개 이상 골라주세요.'}</p>
          <button type="button" className="btn btn--primary" onClick={onGenerate} disabled={isBusy || !ws.canGenerateReview} aria-busy={isBusy}>
            <AppIcon name="sparkle" /> 리뷰 만들기
          </button>
        </>
      )}
      {view === 'draft' && (
        <>
          <p className="flow-actions__hint" role="status">{copyStatus === 'copied' ? '리뷰를 복사했어요. 원하는 곳에 붙여넣어 주세요.' : copyStatus === 'failed' ? '복사하지 못했어요. 다시 누르거나 초안을 직접 선택해 주세요.' : Number.isFinite(ws.reviewsRemaining) ? `오늘 남은 리뷰 생성·다듬기 ${ws.reviewsRemaining}회` : '마음에 드는 표현으로 다듬고 복사해 보세요.'}</p>
          {activeVersion ? (
            <button type="button" className="btn btn--primary" onClick={onCopy} disabled={isBusy || !activeVersion.text.trim()} aria-busy={isBusy}>
              <AppIcon name={copyStatus === 'copied' ? 'check' : 'copy'} />{isBusy ? '리뷰를 작성하는 중…' : copyStatus === 'copied' ? '복사 완료' : copyStatus === 'failed' ? '다시 복사하기' : '리뷰 복사하기'}
            </button>
          ) : <button type="button" className="btn btn--primary" onClick={onContinue} disabled={isBusy}>키워드 선택으로 돌아가기</button>}
        </>
      )}
    </footer>
  )
}

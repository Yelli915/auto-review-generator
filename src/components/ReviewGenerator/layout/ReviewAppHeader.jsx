import AppIcon from '../AppIcon'

const STEPS = [
  { id: 'compose', title: '리뷰 재료', back: 'home', backLabel: '홈으로 돌아가기' },
  { id: 'keywords', title: '키워드와 문체', back: 'compose', backLabel: '리뷰 재료 수정하기' },
  { id: 'draft', title: '리뷰 결과', back: 'keywords', backLabel: '키워드와 문체 수정하기' },
]

export default function ReviewAppHeader({ view, isBusy, onNavigate: goTo, headingRef }) {
  const isHome = view === 'home'
  const stepIndex = STEPS.findIndex((step) => step.id === view)
  const step = STEPS[stepIndex]

  return (
    <header className={`app-header${isHome ? ' app-header--home' : ''}`}>
      <div className="app-header__row">
        {isHome ? <span className="app-header__symbol"><AppIcon name="write" /></span> : (
          <button type="button" className="icon-button" aria-label={step.backLabel} onClick={() => goTo(step.back)} disabled={isBusy}><AppIcon name="back" /></button>
        )}
        <h1 ref={headingRef} tabIndex={-1}>{isHome ? '오토리뷰' : step.title}</h1>
        {!isHome && <button type="button" className="icon-button" aria-label="홈으로" onClick={() => goTo('home')} disabled={isBusy}><AppIcon name="home" /></button>}
      </div>
      {!isHome && (
        <div className="flow-progress">
          <ol aria-label="리뷰 작성 단계">
            {STEPS.map((item, index) => (
              <li key={item.id} className={index <= stepIndex ? 'is-reached' : ''} aria-current={item.id === view ? 'step' : undefined}>
                <span className="visually-hidden">{index + 1}. {item.title}</span>
              </li>
            ))}
          </ol>
          <span>{stepIndex + 1} / {STEPS.length}</span>
        </div>
      )}
    </header>
  )
}

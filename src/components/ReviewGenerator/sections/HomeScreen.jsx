import AppIcon from '../AppIcon'

export default function HomeScreen({ hasDraft, version, onStart, onResume }) {
  return (
    <section className="home-screen" aria-label="홈">
      <div className="home-intro">
        <span className="home-intro__art" aria-hidden="true"><AppIcon name="write" /><span><AppIcon name="sparkle" /></span></span>
        <p className="home-intro__eyebrow">나의 경험을, 나다운 리뷰로</p>
        <h2>짧은 경험도<br />좋은 리뷰가 되니까</h2>
        <p>사진이나 상품 링크에 경험을 더해<br />나만의 리뷰를 간편하게 완성해 보세요.</p>
        <button type="button" className="btn btn--primary home-start" onClick={onStart}>
          <AppIcon name="write" /> 새 리뷰 만들기
        </button>
      </div>

      {hasDraft && (
        <section className="home-draft" aria-labelledby="home-draft-title">
          <div className="home-section-heading"><h2 id="home-draft-title">이어서 작성하기</h2><span>임시 초안</span></div>
          <button type="button" className="resume-card" onClick={onResume}>
            <span className="resume-card__icon"><AppIcon name={version ? 'reviews' : 'write'} /></span>
            <span className="resume-card__body">
              <strong>{version ? '작성 중인 리뷰' : '아직 못다 쓴 이야기'}</strong>
              <span>{version?.text || '입력한 내용부터 이어서 완성해 보세요.'}</span>
            </span>
            <AppIcon name="arrow" />
          </button>
        </section>
      )}

      <section className="home-guide" aria-labelledby="home-guide-title">
        <h2 id="home-guide-title">리뷰는 이렇게 완성돼요</h2>
        <ol>
          <li><span>1</span><div><strong>사진이나 링크를 담고</strong><p>좋았던 점, 아쉬웠던 점도 함께 남겨요.</p></div></li>
          <li><span>2</span><div><strong>내 경험에 맞는 키워드를 골라요</strong><p>분량과 말투도 원하는 대로 정해요.</p></div></li>
          <li><span>3</span><div><strong>나만의 리뷰를 완성해요</strong><p>표현을 다듬고 복사하면 끝이에요.</p></div></li>
        </ol>
      </section>
      <p className="storage-note">작성 내용은 이 브라우저 탭에서 임시로 보관돼요.<br />완성한 리뷰는 복사해서 따로 저장해 주세요.</p>
    </section>
  )
}

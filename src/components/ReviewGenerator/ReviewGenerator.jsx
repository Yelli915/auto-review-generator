import { useState } from 'react'
import CategorySection from './sections/CategorySection'
import KeywordSection from './sections/KeywordSection'
import ProductSection from './sections/ProductSection'
import ResultPanel from './sections/ResultPanel'
import SourceSection from './sections/SourceSection'
import { useReviewWorkspace } from './hooks/useReviewWorkspace'
import { clearDraft } from './utils/draftStorage'

function Workspace({ requestLogin, onReset }) {
  // 휴대폰 폭에서는 입력/초안 중 한 화면만 보입니다. 데스크톱에서는 두 화면이 나란히 보여 이 값은 무시됩니다.
  const [view, setView] = useState('compose')
  // 휴대폰 초안 화면에서는 사진 칸이 안 보이므로 붙여넣기를 받지 않습니다. (렌더 때 폭을 읽어 창 크기만 바꾼 경우엔 다음 렌더에 반영됩니다.)
  const pasteEnabled = view === 'compose' || !window.matchMedia?.('(max-width: 960px)').matches
  const ws = useReviewWorkspace({ requestLogin, pasteEnabled })
  const isBusy = Boolean(ws.busy)
  const errorFor = (scope) => (ws.error?.scope === scope ? ws.error.message : '')
  const showProduct = ws.isLinkMode && ws.productAnalysis
  const goTo = (next) => {
    setView(next)
    window.scrollTo({ top: 0 })
  }
  const latestVersion = ws.versions.at(-1)

  const sourceAction = showProduct && !ws.productUrlChanged
    ? null
    : ws.isLinkMode
      ? {
          label: ws.busy === 'analyze'
            ? '상품 정보 분석 중...'
            : showProduct ? '바뀐 링크로 다시 분석하기' : '상품 링크 분석하기',
          onClick: ws.analyzeProduct,
          disabled: !ws.productUrl.trim(),
          pending: ws.busy === 'analyze',
        }
      : {
          label: ws.busy === 'keywords'
            ? '키워드 만드는 중...'
            : ws.upload.isProcessing
              ? '사진 처리 중...'
              : ws.hasSource ? '이 사진으로 키워드 다시 만들기' : '사진으로 키워드 만들기',
          onClick: () => ws.buildKeywords(),
          disabled: !ws.canBuildKeywords,
          pending: ws.busy === 'keywords',
        }

  return (
    <main className="workspace" data-view={view}>
      <div className="screen screen--compose" role="region" aria-labelledby="screen-compose-title">
        <header className="screen__header">
          <span className="screen__step">1 / 2</span>
          {latestVersion && (
            <button type="button" className="btn-link screen__jump" onClick={() => goTo('draft')}>
              초안 v{latestVersion.n} 보기 →
            </button>
          )}
          <h1 className="screen__title" id="screen-compose-title">어떤 리뷰를 쓸까요?</h1>
        </header>
        <CategorySection
          category={ws.category}
          subcategory={ws.subcategory}
          onCategoryChange={ws.setCategory}
          onSubcategoryChange={ws.setSubcategory}
          disabled={isBusy}
        />
        <SourceSection
          category={ws.category}
          canUseLink={ws.canUseLink}
          isLinkMode={ws.isLinkMode}
          onInputModeChange={ws.setInputMode}
          productUrl={ws.productUrl}
          onProductUrlChange={ws.setProductUrl}
          rating={ws.rating}
          onRatingChange={ws.setRating}
          userExperience={ws.userExperience}
          onUserExperienceChange={ws.setUserExperience}
          upload={ws.upload}
          missingImageCount={ws.missingImageCount}
          disabled={isBusy}
          action={sourceAction}
          error={errorFor('analyze') || (!showProduct && errorFor('keywords'))}
        />
        {showProduct && (
          <ProductSection
            analysis={ws.productAnalysis}
            product={ws.product}
            onProductChange={ws.updateProduct}
            optionGroups={ws.optionGroups}
            selections={ws.optionSelections}
            onSelectionChange={ws.setOptionSelection}
            disabled={isBusy}
            action={{
              label: ws.busy === 'keywords'
                ? '키워드 만드는 중...'
                : ws.hasSource ? '이 정보로 키워드 다시 만들기' : '이 정보로 키워드 만들기',
              onClick: () => ws.buildKeywords(),
              disabled: !ws.canBuildKeywords,
              pending: ws.busy === 'keywords',
            }}
            error={errorFor('keywords')}
          />
        )}
        <KeywordSection
          sectionRef={ws.keywordSectionRef}
          hasSource={ws.hasSource}
          isLoading={ws.busy === 'keywords' || ws.busy === 'refresh'}
          disabled={isBusy}
          stale={ws.keywordsStale}
          keywords={ws.keywords}
          customKeywords={ws.customKeywords}
          selected={ws.selectedKeywords}
          onToggle={ws.toggleKeyword}
          onToggleAll={ws.toggleAllKeywords}
          onAddCustom={ws.addCustomKeyword}
          onRemoveCustom={ws.removeCustomKeyword}
          onRefresh={() => ws.buildKeywords({ avoidPrevious: true })}
          canRefresh={ws.canBuildKeywords}
          length={ws.length}
          onLengthChange={ws.setLength}
          tone={ws.tone}
          onToneChange={ws.setTone}
          onGenerate={() => ws.writeReview(null, () => goTo('draft'))}
          canGenerate={ws.canGenerateReview}
          isGenerating={ws.busy === 'review'}
          error={errorFor('refresh')}
        />
      </div>

      <div className="screen screen--draft" role="region" aria-label="초안">
        <header className="screen__header">
          <button type="button" className="btn-link screen__back" onClick={() => goTo('compose')}>
            ← 입력 수정
          </button>
          <span className="screen__step">2 / 2</span>
        </header>
        <ResultPanel
          panelRef={ws.resultRef}
          versions={ws.versions}
          activeVersion={ws.activeVersion}
          onSelectVersion={ws.setActiveVersion}
          onEdit={ws.editActiveVersion}
          isStreaming={ws.busy === 'review'}
          canGenerate={ws.canGenerateReview}
          onRegenerate={() => ws.writeReview()}
          onRewrite={(action) => ws.writeReview(action)}
          onReset={onReset}
          disabled={isBusy}
          error={errorFor('review')}
          remaining={ws.reviewsRemaining}
        />
      </div>
    </main>
  )
}

export default function ReviewGenerator({ requestLogin }) {
  const [resetKey, setResetKey] = useState(0)
  return (
    <Workspace
      key={resetKey}
      requestLogin={requestLogin}
      onReset={() => {
        clearDraft()
        setResetKey((key) => key + 1)
      }}
    />
  )
}

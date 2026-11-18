import { useRef, useState } from 'react'
import ReviewAppHeader from './layout/ReviewAppHeader'
import ReviewStepActions from './layout/ReviewStepActions'
import ResetReviewDialog from './layout/ResetReviewDialog'
import { useReviewClipboard } from './hooks/useReviewClipboard'
import { useActionBarHeight } from './hooks/useActionBarHeight'
import CategorySection from './sections/CategorySection'
import ChoiceGroup from './sections/ChoiceGroup'
import HomeScreen from './sections/HomeScreen'
import KeywordSection from './sections/KeywordSection'
import ProductSection from './sections/ProductSection'
import ResultPanel from './sections/ResultPanel'
import SourceSection from './sections/SourceSection'
import { useReviewWorkspace } from './hooks/useReviewWorkspace'
import { clearDraft } from './utils/draftStorage'
import { getComposeAction, getResumeView, hasWorkspaceContent } from './utils/reviewWorkflow'

export function Workspace({ onReset, initialView = 'home' }) {
  const [view, setView] = useState(initialView)
  const { height: actionHeight, ref: actionRef } = useActionBarHeight(view)
  const headingRef = useRef(null)
  const resetDialogRef = useRef(null)
  const ws = useReviewWorkspace({ pasteEnabled: view === 'compose' })
  const isBusy = Boolean(ws.busy)
  const isHome = view === 'home'
  const hasDraft = hasWorkspaceContent(ws)
  const activeVersion = ws.versions[ws.activeVersion]
  const composeAction = getComposeAction(ws)
  const errorFor = (scope) => ws.error?.scope === scope ? ws.error.message : ''

  const goTo = (next) => {
    setView(next)
    window.scrollTo({ top: 0 })
    requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }))
  }
  const buildKeywords = async () => {
    if (await ws.buildKeywords()) goTo('keywords')
  }
  const advanceFromCompose = () => {
    if (composeAction.kind === 'analyze') return ws.analyzeProduct()
    if (composeAction.kind === 'continue') return goTo('keywords')
    return buildKeywords()
  }
  const { copy: copyReview, status: copyStatus } = useReviewClipboard(activeVersion, isBusy)

  return (
    <>
      <ReviewAppHeader view={view} isBusy={isBusy} onNavigate={goTo} headingRef={headingRef} />

      <main className={`workspace${isHome ? ' workspace--home' : ''}`} style={isHome ? undefined : { '--action-space': `${actionHeight}px` }}>
        <div hidden={!isHome}>
          <HomeScreen hasDraft={hasDraft} version={activeVersion} onResume={() => goTo(getResumeView(ws))} onStart={() => hasDraft ? resetDialogRef.current.showModal() : goTo('compose')} />
        </div>

        <div className="screen screen--compose" hidden={view !== 'compose'} role="region" aria-label="리뷰 재료 입력">
          <div className="source-type">
            <ChoiceGroup legend="어떤 경험인가요?" options={[{ value: 'place', label: '다녀온 장소' }, { value: 'product', label: '써 본 상품' }]} value={ws.category} onChange={ws.setCategory} disabled={isBusy} />
          </div>
          <SourceSection
            category={ws.category} canUseLink={ws.canUseLink} isLinkMode={ws.isLinkMode}
            onInputModeChange={ws.setInputMode} productUrl={ws.productUrl} onProductUrlChange={ws.setProductUrl}
            rating={ws.rating} onRatingChange={ws.setRating} userExperience={ws.userExperience} onUserExperienceChange={ws.setUserExperience}
            upload={ws.upload} missingImageCount={ws.missingImageCount} disabled={isBusy}
            details={<CategorySection category={ws.category} subcategory={ws.subcategory} onSubcategoryChange={ws.setSubcategory} disabled={isBusy} />}
          />
          {ws.isLinkMode && ws.productAnalysis && (
            <ProductSection analysis={ws.productAnalysis} product={ws.product} onProductChange={ws.updateProduct}
              optionGroups={ws.optionGroups} selections={ws.optionSelections} onSelectionChange={ws.setOptionSelection}
              disabled={isBusy} isProductInfoReady={ws.isProductInfoReady} />
          )}
        </div>

        <div className="screen screen--keywords" hidden={view !== 'keywords'} role="region" aria-label="키워드와 문체 선택">
          <KeywordSection sectionRef={ws.keywordSectionRef} hasSource={ws.hasSource}
            isLoading={ws.busy === 'keywords' || ws.busy === 'refresh'} disabled={isBusy} stale={ws.keywordsStale}
            keywords={ws.keywords} customKeywords={ws.customKeywords} selected={ws.selectedKeywords}
            onToggle={ws.toggleKeyword} onToggleAll={ws.toggleAllKeywords} onAddCustom={ws.addCustomKeyword} onRemoveCustom={ws.removeCustomKeyword}
            onRefresh={() => ws.buildKeywords({ avoidPrevious: true })} canRefresh={ws.canBuildKeywords}
            length={ws.length} onLengthChange={ws.setLength} tone={ws.tone} onToneChange={ws.setTone}
            hasExperience={Boolean(ws.userExperience.trim())} error={errorFor('refresh')} onAddSource={() => goTo('compose')} />
        </div>

        <div className="screen screen--draft" hidden={view !== 'draft'} role="region" aria-label="생성된 리뷰 결과">
          <ResultPanel panelRef={ws.resultRef} versions={ws.versions} activeVersion={ws.activeVersion}
            onSelectVersion={ws.setActiveVersion} onEdit={ws.editActiveVersion} isStreaming={ws.busy === 'review'}
            canGenerate={ws.canGenerateReview} onRegenerate={() => ws.writeReview()} onRewrite={(action) => ws.writeReview(action)}
            onReset={onReset} disabled={isBusy} error={errorFor('review')} />
          <p className="storage-note">이 화면의 버전은 같은 리뷰를 생성·수정한 기록이에요.<br />완성한 리뷰는 복사해서 따로 저장해 주세요.</p>
        </div>
      </main>

      {!isHome && (
        <ReviewStepActions view={view} actionRef={actionRef} workspace={ws} composeAction={composeAction}
          onAdvance={advanceFromCompose} onContinue={() => goTo('keywords')}
          onGenerate={() => ws.writeReview(null, () => goTo('draft'))}
          onCopy={copyReview} copyStatus={copyStatus} />
      )}

      <ResetReviewDialog dialogRef={resetDialogRef} onConfirm={onReset} />
    </>
  )
}

export default function ReviewGenerator() {
  const [resetKey, setResetKey] = useState(0)
  return <Workspace key={resetKey} initialView={resetKey ? 'compose' : 'home'} onReset={() => {
    clearDraft()
    setResetKey((key) => key + 1)
    window.scrollTo({ top: 0 })
  }} />
}

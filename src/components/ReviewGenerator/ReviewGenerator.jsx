import CategoryStep from './steps/CategoryStep'
import UploadStep from './steps/UploadStep'
import ProductOptionStep from './steps/ProductOptionStep'
import KeywordStep from './steps/KeywordStep'
import ReviewStep from './steps/ReviewStep'
import {
  DEFAULT_REVIEW_LENGTH,
  DEFAULT_REVIEW_TONE,
} from '../../../shared/reviewOptions'
import {
  STEP_ORDER,
  STEPS,
  useReviewGeneratorFlow,
} from './hooks/useReviewGeneratorFlow'

const STEP_META = {
  [STEPS.CATEGORY]: {
    title: '리뷰 분야 선택',
    desc: '먼저 장소인지 상품인지 선택합니다.',
    label: '분야',
  },
  [STEPS.UPLOAD]: {
    title: '사진 또는 링크 입력',
    desc: '리뷰 재료와 별점을 입력합니다.',
    label: '입력',
  },
  [STEPS.PRODUCT_OPTIONS]: {
    title: '상품 옵션 선택',
    desc: 'URL 분석 결과에서 옵션을 고르고 반영합니다.',
    label: '옵션',
  },
  [STEPS.KEYWORD]: {
    title: '키워드 선택',
    desc: '옵션과 재료를 반영한 키워드를 고릅니다.',
    label: '키워드',
  },
  [STEPS.REVIEW]: {
    title: '결과 확인',
    desc: '생성된 리뷰를 확인하고 복사합니다.',
    label: '리뷰',
  },
}

const RATING_LABELS = ['', '매우 불만족', '불만족', '보통', '만족', '매우 만족']

export default function ReviewGenerator({ onReviewComplete }) {
  const {
    step,
    reviewCategory,
    reviewSubcategory,
    productAnalysis,
    productOptionSelections,
    keywords,
    review,
    isLoading,
    isStreaming,
    error,
    lastUsedOptions,
    handleBackToCategory,
    handleBackToUpload,
    handleCategorySelect,
    handleKeywordNext,
    handleProductOptionNext,
    handleRefresh,
    handleRegenerate,
    handleResetToStart,
    handleUploadNext,
  } = useReviewGeneratorFlow({ onReviewComplete })

  const stepIndex = STEP_ORDER.indexOf(step)
  const stepMeta = STEP_META[step]
  const stepClass = (index) => {
    if (index < stepIndex) return 'stepper__item is-done'
    if (index === stepIndex) return 'stepper__item is-active'
    return 'stepper__item'
  }
  const isEntryStep = step === STEPS.CATEGORY || step === STEPS.UPLOAD

  return (
    <div className={`review-app ${isEntryStep ? 'review-app--upload-center' : ''}`}>
      <header className="review-app__header">
        <p className="review-app__eyebrow">
          STEP {stepIndex + 1} / {STEP_ORDER.length}
        </p>
        <h1 className="review-app__title">{stepMeta.title}</h1>
        <p className="review-app__tagline">{stepMeta.desc}</p>
      </header>

      <nav className="stepper" aria-label="진행 단계">
        {STEP_ORDER.map((item, index) => (
          <div
            key={item}
            className={stepClass(index)}
            aria-current={step === item ? 'step' : undefined}
          >
            <span className="stepper__dot" aria-hidden="true">
              {index + 1}
            </span>
            <span className="stepper__label">{STEP_META[item].label}</span>
          </div>
        ))}
      </nav>

      <main className="review-app__main">
        {error && (
          <div className="banner banner--error" role="alert">
            {error}
          </div>
        )}
        {isLoading && (
          <div className="banner banner--info" role="status" aria-live="polite">
            {step === STEPS.UPLOAD
              ? '이미지를 분석하고 키워드를 준비하고 있습니다.'
              : '선택한 옵션을 반영해 다시 계산하고 있습니다.'}
          </div>
        )}

        {step === STEPS.CATEGORY && <CategoryStep onSelect={handleCategorySelect} />}
        {step === STEPS.UPLOAD && (
          <UploadStep
            category={reviewCategory}
            subcategory={reviewSubcategory}
            onNext={handleUploadNext}
            onBackToCategory={handleBackToCategory}
            isLoading={isLoading}
            ratingLabels={RATING_LABELS}
          />
        )}
        {step === STEPS.PRODUCT_OPTIONS && (
          <ProductOptionStep
            key={productAnalysis?.url || 'product-options'}
            analysis={productAnalysis}
            initialSelections={productOptionSelections}
            onNext={handleProductOptionNext}
            onBack={handleBackToUpload}
            isLoading={isLoading}
          />
        )}
        {step === STEPS.KEYWORD && (
          <KeywordStep
            keywords={keywords}
            initialSelectedKeywords={lastUsedOptions?.keywords}
            initialLength={lastUsedOptions?.length ?? DEFAULT_REVIEW_LENGTH}
            initialTone={lastUsedOptions?.tone ?? DEFAULT_REVIEW_TONE}
            onNext={handleKeywordNext}
            onRefresh={handleRefresh}
            onBackToUpload={handleBackToUpload}
            isLoading={isLoading}
          />
        )}
        {step === STEPS.REVIEW && (
          <ReviewStep
            review={review}
            isStreaming={isStreaming}
            onRegenerate={handleRegenerate}
            onReset={handleResetToStart}
          />
        )}
      </main>

      <footer className="review-app__footer">
        <p>Auto Review Generator</p>
      </footer>
    </div>
  )
}

import { hasUsefulProductInfo } from './productInfo.js'

export function buildAnalysisResult({
  url,
  product,
  productContext,
  optionGroups = [],
  analysisStatus = 'ok',
  warning = '',
  needsManualInput,
}) {
  return {
    ok: true,
    url,
    product,
    productContext,
    optionGroups,
    analysisStatus,
    warning,
    needsManualInput:
      typeof needsManualInput === 'boolean'
        ? needsManualInput
        : !hasUsefulProductInfo(product),
  }
}

import { decodeHtmlEntities, extractTitle, parseAttributes, readMetaTags } from './htmlUtils.js'
import { buildProductInfo, firstString, isAccessChallengeText, normalizeImageUrl } from './productInfo.js'
import { extractEmbeddedProductData } from './embeddedData.js'
import { extractStructuredProductData } from './structuredData.js'

// 페이지의 <script>를 한 번만 훑어 JSON-LD와 내장 JSON 추출이 같이 씁니다.
function readScripts(html) {
  return Array.from(html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi), (match) => ({
    attrs: parseAttributes(match[1] || ''),
    body: match[2] || '',
  }))
}

// -- HTML metadata extraction (orchestrates the strategies above) --

export function isAccessChallengeHtml(html) {
  if (typeof html !== 'string' || !html.trim()) return false
  return isAccessChallengeText(`${extractTitle(html)} ${html.slice(0, 6000)}`)
}

// 접근 차단 페이지인지는 호출하는 쪽(isAccessChallengeHtml)이 먼저 확인합니다.
export function extractProductInfoFromHtml(html, url) {
  const meta = readMetaTags(html)
  const metaContent = (key) => meta.get(key) || ''
  const scripts = readScripts(html)
  const structured = extractStructuredProductData(scripts)
  const embedded = extractEmbeddedProductData(scripts, url)
  const title = firstString(structured.name, embedded.name, extractTitle(html, meta))
  const description =
    metaContent('og:description') ||
    metaContent('description') ||
    structured.description ||
    embedded.description
  const site = metaContent('og:site_name')
  const imageUrl =
    metaContent('og:image') ||
    metaContent('twitter:image') ||
    structured.imageUrl ||
    embedded.imageUrl
  const price =
    metaContent('product:price:amount') ||
    metaContent('og:price:amount') ||
    metaContent('twitter:data1') ||
    structured.price ||
    embedded.price
  return buildProductInfo({
    name: title,
    brand: firstString(structured.brand, embedded.brand),
    imageUrl: normalizeImageUrl(imageUrl, url),
    price,
    description,
    site,
    url,
  })
}

// -- product option group extraction (<select> and radio/checkbox groups) --

function normalizeOptionText(text) {
  return decodeHtmlEntities(String(text || ''))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// <label for>를 처음 필요할 때 한 번만 훑어 id → 라벨 맵을 만듭니다. 입력마다 HTML 전체를 다시 훑지 않습니다.
function createLabelLookup(html) {
  let labels = null
  return (inputId) => {
    if (!inputId) return ''
    if (!labels) {
      labels = new Map()
      const labelRe = /<label\b([^>]*)>([\s\S]*?)<\/label>/gi
      let match
      while ((match = labelRe.exec(html)) !== null) {
        const target = parseAttributes(match[1] || '').for
        if (target && !labels.has(target)) labels.set(target, normalizeOptionText(match[2] || ''))
      }
    }
    return labels.get(inputId) || ''
  }
}

function simplifyGroupLabel(rawLabel, fallback) {
  const text = normalizeOptionText(rawLabel || fallback)
  if (!text) return ''
  return text.replace(/\s*[:|·.-]\s*$/, '').trim()
}

// value·label이 같은 옵션은 하나만 남기고 최대 12개까지 씁니다.
function uniqueOptions(options) {
  const seen = new Set()
  return options
    .filter((option) => {
      const key = `${option.value}::${option.label}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 12)
}

function extractSelectOptionGroups(html, labelFor) {
  const groups = []
  const selectRe = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi
  let selectMatch
  while ((selectMatch = selectRe.exec(html)) !== null) {
    const attrs = parseAttributes(selectMatch[1] || '')
    const body = selectMatch[2] || ''
    const groupLabel = simplifyGroupLabel(
      attrs['aria-label'] ||
        attrs['data-label'] ||
        labelFor(attrs.id) ||
        attrs.name ||
        attrs.id,
      '옵션',
    )

    const options = []
    const optionRe = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi
    let optionMatch
    while ((optionMatch = optionRe.exec(body)) !== null) {
      const optionAttrs = parseAttributes(optionMatch[1] || '')
      const label = normalizeOptionText(optionMatch[2] || optionAttrs.label || '')
      const value = normalizeOptionText(optionAttrs.value || label)
      const disabled = 'disabled' in optionAttrs
      if (!label || disabled) continue
      const isPlaceholder =
        !value ||
        /선택|choose|select|option|사이즈 선택|색상 선택|옵션 선택/i.test(label)
      if (isPlaceholder && options.length === 0) continue
      options.push({
        value: value || label,
        label,
      })
    }

    const unique = uniqueOptions(options)
    if (unique.length >= 2) {
      groups.push({
        id: attrs.id || attrs.name || `select-${groups.length + 1}`,
        label: groupLabel,
        type: 'select',
        options: unique,
      })
    }
  }
  return groups
}

function extractRadioOptionGroups(html, labelFor) {
  const inputRe = /<input\b([^>]*\btype=["']?(?:radio|checkbox)["']?[^>]*)>/gi
  const grouped = new Map()
  let inputMatch
  while ((inputMatch = inputRe.exec(html)) !== null) {
    const attrs = parseAttributes(inputMatch[1] || '')
    const name = attrs.name || attrs.id
    if (!name) continue
    const associatedLabel = labelFor(attrs.id)
    const label =
      normalizeOptionText(attrs['aria-label']) ||
      normalizeOptionText(attrs.title) ||
      associatedLabel ||
      normalizeOptionText(attrs.value)
    if (!label) continue
    const list = grouped.get(name) || {
      id: name,
      label: simplifyGroupLabel(
        attrs['aria-label'] || associatedLabel || attrs.name || attrs.id,
        '옵션',
      ),
      type: attrs.type || 'radio',
      options: [],
    }
    list.options.push({
      value: normalizeOptionText(attrs.value || label),
      label,
    })
    grouped.set(name, list)
  }

  return Array.from(grouped.values())
    .map((group) => ({ ...group, options: uniqueOptions(group.options) }))
    .filter((group) => group.options.length >= 2)
}

export function extractProductOptionGroupsFromHtml(html) {
  const labelFor = createLabelLookup(html)
  return [
    ...extractSelectOptionGroups(html, labelFor),
    ...extractRadioOptionGroups(html, labelFor),
  ].slice(0, 8)
}

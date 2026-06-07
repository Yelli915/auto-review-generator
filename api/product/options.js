import { decodeHtmlEntities, parseAttributes } from './htmlUtils.js'

function normalizeOptionText(text) {
  return decodeHtmlEntities(String(text || ''))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractAssociatedLabel(html, inputId) {
  if (!inputId) return ''
  const escaped = inputId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const labelMatch = html.match(
    new RegExp(`<label\\b[^>]*for=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/label>`, 'i'),
  )
  return normalizeOptionText(labelMatch?.[1] || '')
}

function simplifyGroupLabel(rawLabel, fallback) {
  const text = normalizeOptionText(rawLabel || fallback)
  if (!text) return ''
  return text.replace(/\s*[:|·.-]\s*$/, '').trim()
}

function extractSelectOptionGroups(html) {
  const groups = []
  const selectRe = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi
  let selectMatch
  while ((selectMatch = selectRe.exec(html)) !== null) {
    const attrs = parseAttributes(selectMatch[1] || '')
    const body = selectMatch[2] || ''
    const groupLabel = simplifyGroupLabel(
      attrs['aria-label'] ||
        attrs['data-label'] ||
        extractAssociatedLabel(html, attrs.id) ||
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
      if (!value && !label) continue
      const isPlaceholder =
        !value ||
        /선택|choose|select|option|사이즈 선택|색상 선택|옵션 선택/i.test(label)
      if (isPlaceholder && options.length === 0) continue
      options.push({
        value: value || label,
        label,
      })
    }

    const uniqueOptions = []
    const seen = new Set()
    for (const option of options) {
      const key = `${option.value}::${option.label}`
      if (seen.has(key)) continue
      seen.add(key)
      uniqueOptions.push(option)
    }

    if (uniqueOptions.length >= 2) {
      groups.push({
        id: attrs.id || attrs.name || `select-${groups.length + 1}`,
        label: groupLabel,
        type: 'select',
        options: uniqueOptions.slice(0, 12),
      })
    }
  }
  return groups
}

function extractRadioOptionGroups(html) {
  const inputRe = /<input\b([^>]*\btype=["']?(?:radio|checkbox)["']?[^>]*)>/gi
  const grouped = new Map()
  let inputMatch
  while ((inputMatch = inputRe.exec(html)) !== null) {
    const attrs = parseAttributes(inputMatch[1] || '')
    const name = attrs.name || attrs.id
    if (!name) continue
    const label =
      normalizeOptionText(attrs['aria-label']) ||
      normalizeOptionText(attrs.title) ||
      extractAssociatedLabel(html, attrs.id) ||
      normalizeOptionText(attrs.value)
    if (!label) continue
    const groupLabel = simplifyGroupLabel(
      attrs['aria-label'] || extractAssociatedLabel(html, attrs.id) || attrs.name || attrs.id,
      '옵션',
    )
    const list = grouped.get(name) || {
      id: name,
      label: groupLabel,
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
    .map((group) => {
      const seen = new Set()
      const options = []
      for (const option of group.options) {
        const key = `${option.value}::${option.label}`
        if (seen.has(key)) continue
        seen.add(key)
        options.push(option)
      }
      return { ...group, options: options.slice(0, 12) }
    })
    .filter((group) => group.options.length >= 2)
}

export function extractProductOptionGroupsFromHtml(html) {
  return [...extractSelectOptionGroups(html), ...extractRadioOptionGroups(html)].slice(
    0,
    8,
  )
}

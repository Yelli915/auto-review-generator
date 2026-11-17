// 키워드는 "조명 은은함"처럼 명사형이고 리뷰에는 "은은한 조명"처럼 활용형으로 들어가므로,
// 키워드의 각 단어에서 명사형 어미(함/음/됨/움/임)를 뗀 어간이 들어간 어절을 강조합니다.
// ponytail: 어간 부분 일치라 "불만족"처럼 다른 뜻 어절도 잡힐 수 있음. 정확도가 필요하면 형태소 분석기로 교체.
const NOMINAL_ENDING_RE = /(함|음|됨|움|임)$/
const MIN_STEM_LENGTH = 2

function buildStems(keywords, minLength = MIN_STEM_LENGTH) {
  const stems = []
  for (const keyword of keywords) {
    for (const word of String(keyword).split(/\s+/)) {
      const stem = word.replace(NOMINAL_ENDING_RE, '')
      if (stem.length >= minLength) stems.push({ stem, keyword })
    }
  }
  // 어간이 겹칠 때 더 긴(구체적인) 쪽 키워드로 묶이도록 긴 어간부터 비교합니다.
  return stems.sort((a, b) => b.stem.length - a.stem.length)
}

// 리뷰 텍스트를 [{ text, keyword }] 조각으로 나눕니다. keyword가 있으면 강조할 어절입니다.
export function splitKeywordHighlights(text, keywords) {
  const stems = buildStems(Array.isArray(keywords) ? keywords : [])
  if (!text || !stems.length) return [{ text: text || '', keyword: null }]

  const segments = []
  const push = (part, keyword) => {
    const last = segments.at(-1)
    if (last && !keyword && !last.keyword) last.text += part
    else segments.push({ text: part, keyword })
  }
  for (const part of text.split(/(\s+)/)) {
    if (!part) continue
    // 문장부호는 강조 밖에 둡니다: "라떼가," → "라떼가" + ","
    const [, word, punct] = part.match(/^(.*?)([.,!?…~'")\]]*)$/s)
    const match = /\s/.test(part) || !word ? null : stems.find(({ stem }) => word.includes(stem))
    if (!match) {
      push(part, null)
      continue
    }
    push(word, match.keyword)
    if (punct) push(punct, null)
  }
  return segments
}

// 리뷰에 어간이 하나도 안 들어간 키워드를 돌려줍니다. "맛"·"편함"처럼 두 글자 어간이 없는 키워드만
// 한 글자 어간으로 검사합니다("가성비 좋음"의 "좋"처럼 흔한 글자 때문에 들어간 것으로 보지 않도록).
export function findMissingKeywords(text, keywords) {
  if (!text || !Array.isArray(keywords)) return []
  return keywords.filter((keyword) => {
    const longStems = buildStems([keyword])
    const stems = longStems.length ? longStems : buildStems([keyword], 1)
    return stems.length > 0 && !stems.some(({ stem }) => text.includes(stem))
  })
}

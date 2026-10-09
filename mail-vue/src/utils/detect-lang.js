const LANGS = ['zh', 'en', 'ja', 'ko']

export function uiLang(locale) {
  const lang = String(locale || '').toLowerCase()
  if (lang.startsWith('zh')) return 'zh'
  if (lang.startsWith('ja')) return 'ja'
  if (lang.startsWith('ko')) return 'ko'
  return 'en'
}

export function detectEmailLang(text) {
  const sample = stripForDetect(text).slice(0, 4000)
  const hangul = count(sample, /[\uAC00-\uD7AF]/g)
  const kana = count(sample, /[\u3040-\u30FF]/g)
  const han = count(sample, /[\u4E00-\u9FFF]/g)
  const latin = count(sample, /[A-Za-z]/g)
  const total = hangul + kana + han + latin
  if (total < 12) return ''

  if (hangul / total > 0.2) return 'ko'
  if (kana / total > 0.05 || (kana > 2 && han > 0)) return 'ja'
  if (han / total > 0.25) return 'zh'
  if (latin / total > 0.45) return 'en'
  return ''
}

function stripForDetect(text) {
  return String(text || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[\w.+-]+@[\w.-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function count(text, re) {
  return (text.match(re) || []).length
}

export function isTranslatableLang(lang) {
  return LANGS.includes(lang)
}

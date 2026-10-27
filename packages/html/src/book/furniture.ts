export interface BookFurnitureValues {
  folio?: string
  runningHead?: string
}

// Self-contained so the frame composer can embed it beside paginateScript.
export function fillBookFurniture(html: string, values: BookFurnitureValues, dir?: string, lang?: string): string {
  const motifField: Record<string, keyof BookFurnitureValues> = {
    'segnavia:folio': 'folio',
    'segnavia:running-head': 'runningHead',
  }
  const rtlLetter =
    /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}\p{Script=Hanifi_Rohingya}\p{Script=Mende_Kikakui}\p{Script=Old_Hungarian}\p{Script=Imperial_Aramaic}\p{Script=Phoenician}]/u
  const letter = /\p{L}/u
  const rtlLanguages = new Set(['ar', 'arc', 'ckb', 'dv', 'fa', 'he', 'iw', 'ji', 'ks', 'ku', 'nqo', 'ps', 'sd', 'syr', 'ug', 'ur', 'yi'])

  function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  function firstStrong(sample: string): 'ltr' | 'rtl' | null {
    for (const char of sample) {
      if (rtlLetter.test(char)) return 'rtl'
      if (letter.test(char)) return 'ltr'
    }
    return null
  }

  function languageDir(value: string | undefined): 'ltr' | 'rtl' | null {
    if (!value) return null
    return rtlLanguages.has(value.toLowerCase().split('-')[0] ?? '') ? 'rtl' : 'ltr'
  }

  function resolve(sample: string): 'ltr' | 'rtl' {
    if (dir === 'ltr' || dir === 'rtl') return dir
    return languageDir(lang) ?? firstStrong(sample) ?? 'ltr'
  }

  return html.replace(
    /<([a-zA-Z][\w:-]*)([^>]*?)\sdata-motif\s*=\s*(?:(["'])([^"']+)\3|([^\s>]+))([^>]*)>([\s\S]*?)<\/\1>/gi,
    (match, tag, before, _quote, quoted, unquoted, after) => {
      const key = quoted ?? unquoted
      const field = motifField[key]
      if (!field) return match
      const value = values[field]
      if (value === undefined) return ''
      const attrs = `${before}${after}`.replace(/\sdata-motif\s*=\s*(?:(["'])([^"']+)\1|[^\s>]+)/i, '')
      return `<${tag}${attrs}><bdi dir="${resolve(value)}">${escapeHtml(value)}</bdi></${tag}>`
    },
  )
}

export function furnitureScript(): string {
  return fillBookFurniture.toString()
}

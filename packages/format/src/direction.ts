import { z } from 'zod'

export const Direction = z.enum(['ltr', 'rtl', 'auto'])

export const TextDirection = z.enum(['ltr', 'rtl'])
export type TextDirection = z.infer<typeof TextDirection>

// Text direction from content, for the places the library writes text it did
// not author: captions, labels, filled-in values, notes. The rule is the
// Unicode one: the first strong letter decides.

// Scripts written right to left. A letter in any other script is strong
// left to right; digits, punctuation and spaces are weak and decide nothing.
const RTL_LETTER =
  /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}\p{Script=Hanifi_Rohingya}\p{Script=Mende_Kikakui}\p{Script=Old_Hungarian}\p{Script=Imperial_Aramaic}\p{Script=Phoenician}]/u
const LETTER = /\p{L}/u

// Languages written right to left, by primary subtag.
const RTL_LANGUAGES = new Set(['ar', 'arc', 'ckb', 'dv', 'fa', 'he', 'iw', 'ji', 'ks', 'ku', 'nqo', 'ps', 'sd', 'syr', 'ug', 'ur', 'yi'])

export function firstStrongDirection(text: string): TextDirection | null {
  for (const char of text) {
    if (RTL_LETTER.test(char)) return 'rtl'
    if (LETTER.test(char)) return 'ltr'
  }
  return null
}

export function languageDirection(lang: string | undefined): TextDirection | null {
  if (!lang) return null
  return RTL_LANGUAGES.has(lang.toLowerCase().split('-')[0] ?? '') ? 'rtl' : 'ltr'
}

// A declared direction wins; `auto` or none falls to the language, then to
// the text itself, then to left to right. Nested helpers keep this embeddable
// by toString() for the book furniture filler.
export function resolveDirection(dir: 'ltr' | 'rtl' | 'auto' | undefined, lang: string | undefined, sample: string): TextDirection {
  const rtlLetter =
    /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}\p{Script=Hanifi_Rohingya}\p{Script=Mende_Kikakui}\p{Script=Old_Hungarian}\p{Script=Imperial_Aramaic}\p{Script=Phoenician}]/u
  const letter = /\p{L}/u
  const rtlLanguages = new Set(['ar', 'arc', 'ckb', 'dv', 'fa', 'he', 'iw', 'ji', 'ks', 'ku', 'nqo', 'ps', 'sd', 'syr', 'ug', 'ur', 'yi'])
  function firstStrong(text: string): TextDirection | null {
    for (const char of text) {
      if (rtlLetter.test(char)) return 'rtl'
      if (letter.test(char)) return 'ltr'
    }
    return null
  }
  function languageDir(value: string | undefined): TextDirection | null {
    if (!value) return null
    return rtlLanguages.has(value.toLowerCase().split('-')[0] ?? '') ? 'rtl' : 'ltr'
  }
  if (dir === 'ltr' || dir === 'rtl') return dir
  return languageDir(lang) ?? firstStrong(sample) ?? 'ltr'
}

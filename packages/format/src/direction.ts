import { z } from 'zod'

export const Direction = z.enum(['ltr', 'rtl', 'auto'])

export const TextDirection = z.enum(['ltr', 'rtl'])
export type TextDirection = z.infer<typeof TextDirection>

// Text direction from content, for the places the library writes text it did
// not author: captions, labels, filled-in values, notes. The rule is the
// Unicode one: the first strong letter decides.

// What the inputs establish, or null when none does: a declared direction
// wins, then the language, then the first strong letter of the text. The
// rules live inside the function so toString() can embed it in a frame.
export function textDirection(dir: string | undefined, lang: string | undefined, sample: string): TextDirection | null {
  // Scripts written right to left. A letter in any other script is strong
  // left to right; digits, punctuation and spaces are weak and decide nothing.
  const rtlLetter =
    /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}\p{Script=Hanifi_Rohingya}\p{Script=Mende_Kikakui}\p{Script=Old_Hungarian}\p{Script=Imperial_Aramaic}\p{Script=Phoenician}]/u
  const letter = /\p{L}/u
  // Languages written right to left, by primary subtag.
  const rtlLanguages = new Set(['ar', 'arc', 'ckb', 'dv', 'fa', 'he', 'iw', 'ji', 'ks', 'ku', 'nqo', 'ps', 'sd', 'syr', 'ug', 'ur', 'yi'])
  if (dir === 'ltr' || dir === 'rtl') return dir
  if (lang) return rtlLanguages.has(lang.toLowerCase().split('-')[0] ?? '') ? 'rtl' : 'ltr'
  for (const char of sample) {
    if (rtlLetter.test(char)) return 'rtl'
    if (letter.test(char)) return 'ltr'
  }
  return null
}

export function firstStrongDirection(text: string): TextDirection | null {
  return textDirection(undefined, undefined, text)
}

export function languageDirection(lang: string | undefined): TextDirection | null {
  return lang ? textDirection(undefined, lang, '') : null
}

// `auto` or no declared direction falls to the language, then to the text
// itself, then to left to right.
export function resolveDirection(dir: 'ltr' | 'rtl' | 'auto' | undefined, lang: string | undefined, sample: string): TextDirection {
  return textDirection(dir, lang, sample) ?? 'ltr'
}

import type { Word } from '@segnavia/format'

export function remapCaptionWords(words: Word[], script: string): Word[] {
  const scriptWords = script.split(/\s+/).filter(Boolean)
  return words.length === scriptWords.length ? words.map((word, index) => ({ ...word, text: scriptWords[index] ?? word.text })) : words
}

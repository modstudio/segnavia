import type { Word } from '@segnavia/format'

export function splitWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

export function remapCaptionWords(words: Word[], script: string): Word[] {
  const scriptWords = splitWords(script)
  return words.length === scriptWords.length ? words.map((word, index) => ({ ...word, text: scriptWords[index] ?? word.text })) : words
}

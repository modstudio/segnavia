import { splitWords as splitPacedWords, type Word } from '@segnavia/format'

export function splitWords(text: string): string[] {
  return splitPacedWords(text)
}

export function remapCaptionWords(words: Word[], script: string, captionWords = splitWords(script)): Word[] {
  return words.length === captionWords.length ? words.map((word, index) => ({ ...word, text: captionWords[index] ?? word.text })) : words
}

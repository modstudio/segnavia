import { splitWords as splitPacedWords, type Word } from '@segnavia/format'

export function splitWords(text: string): string[] {
  return splitPacedWords(text)
}

export function remapCaptionWords(words: Word[], script: string, captionWords = splitWords(script), wordCounts?: number[]): Word[] {
  if (wordCounts === undefined) {
    return words.length === captionWords.length ? words.map((word, index) => ({ ...word, text: captionWords[index] ?? word.text })) : words
  }
  if (captionWords.length !== wordCounts.length || words.length !== wordCounts.reduce((total, count) => total + count, 0)) return words
  let offset = 0
  return captionWords.flatMap((text, index) => {
    const count = wordCounts[index] ?? 0
    const first = words[offset]
    const last = words[offset + count - 1]
    offset += count
    return first === undefined || last === undefined ? [] : [{ ...first, text, endMs: last.endMs }]
  })
}

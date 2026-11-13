import type { Word } from './deck.ts'

const SENTENCE_END = /[.!?\u05C3\u061F\u06D4\u0964]["'\u05F4\u201D)]*$/u
const CLAUSE_END = /[,;:\u060C\u061B\u05C0]["'\u05F4\u201D)]*$/u

export interface NarrationTiming {
  words: Word[]
  durationMs: number
}

function pacedLength(word: string): number {
  return [...word].filter((character) => !/\p{M}/u.test(character)).length
}

export function splitWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

export function pacedWords(text: string, wordsPerMinute: number): NarrationTiming {
  const msPerCharacter = 60_000 / (wordsPerMinute * 5.5)
  let clock = 0
  const words = splitWords(text).map((word) => {
    const startMs = clock
    const endMs = startMs + Math.max(140, pacedLength(word) * msPerCharacter)
    clock = endMs + (SENTENCE_END.test(word) ? 350 : CLAUSE_END.test(word) ? 150 : 60)
    return { text: word, startMs: Math.round(startMs), endMs: Math.round(endMs) }
  })
  return { words, durationMs: Math.round(clock + 400) }
}

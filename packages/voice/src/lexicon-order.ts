import type { PronunciationEntry } from '@segnavia/format'

export function longestTermsFirst(entries: readonly PronunciationEntry[]): PronunciationEntry[] {
  return [...entries].sort((left, right) => [...right.term].length - [...left.term].length)
}

import type { FontFailure } from '@segnavia/format'
export function firstNotesPages(pageOwners: readonly number[], slideCount: number): number[] {
  return Array.from({ length: slideCount }, (_, slide) => pageOwners.indexOf(slide))
}

export function deckFontFailures(initial: readonly FontFailure[], notes: { failures: FontFailure[] } | undefined): FontFailure[] {
  return [...initial, ...(notes?.failures ?? [])]
}

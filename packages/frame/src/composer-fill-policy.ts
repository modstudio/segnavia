import type { PreflightEntry, PreflightRegion } from '@segnavia/format'

export interface FillStageState<T> {
  done: boolean
  results: T
}

export function runFillStageOnce<T>(state: FillStageState<T>, execute: () => T): T {
  if (state.done) return state.results
  state.done = true
  state.results = execute()
  return state.results
}

export function fillLimits(minimum: string | null, maximum: string | null): { min: number; max: number } {
  return { min: minimum === null ? 1 : Number(minimum), max: maximum === null ? 10_000 : Number(maximum) }
}

export function truncatedRegion(
  subject: string,
  droppedIds: readonly string[],
  folio: string,
  idLimit = 50,
): { fact: PreflightRegion; entry: PreflightEntry } {
  const droppedTotal = droppedIds.length
  const dropped = droppedIds.slice(0, idLimit)
  return {
    fact: { subject, droppedPages: 0, droppedBlocks: droppedTotal, droppedIds: dropped, droppedTotal },
    entry: {
      check: 'region-truncated',
      subject,
      message: `Region ${subject} on page ${folio} was truncated; 0 pages and ${droppedTotal} blocks were dropped.`,
      location: { folio },
    },
  }
}

export function regionRefusal(subject: string, folio: string, excess: number): string {
  return `Region ${subject} on page ${folio} exceeds its block size by ${Math.ceil(excess)}px; enlarge the region or shorten its content to clear this refusal.`
}

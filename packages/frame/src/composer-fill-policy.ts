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
  const min = minimum === null ? 1 : Number(minimum)
  const max = maximum === null ? 10_000 : Number(maximum)
  if (!Number.isSafeInteger(min) || min < 1) throw new Error('data-fill-min must be a positive integer')
  if (!Number.isSafeInteger(max) || max < 1) throw new Error('data-fill-max must be a positive integer')
  return { min, max }
}

export function truncatedRegion(
  subject: string,
  droppedIds: readonly string[],
  folio: string,
  previous?: PreflightRegion,
  idLimit = 50,
): { fact: PreflightRegion; entry: PreflightEntry } {
  const droppedPages = (previous?.droppedPages ?? 0) + 1
  const droppedBlocks = (previous?.droppedBlocks ?? 0) + droppedIds.length
  const dropped = [...(previous?.droppedIds ?? []), ...droppedIds].slice(0, idLimit)
  return {
    fact: { subject, droppedPages, droppedBlocks, droppedIds: dropped, droppedTotal: droppedBlocks },
    entry: {
      check: 'region-truncated',
      subject,
      message: `Region ${subject} was truncated on ${droppedPages} page${droppedPages === 1 ? '' : 's'}; ${droppedBlocks} blocks were dropped.`,
      location: { folio },
    },
  }
}

export function recordTruncatedRegion(
  subject: string,
  droppedIds: readonly string[],
  folio: string,
  entries: PreflightEntry[],
  facts: PreflightRegion[],
): void {
  const factIndex = facts.findIndex((fact) => fact.subject === subject && fact.droppedTotal !== undefined)
  const result = truncatedRegion(subject, droppedIds, folio, factIndex < 0 ? undefined : facts[factIndex])
  if (factIndex < 0) facts.push(result.fact)
  else facts[factIndex] = result.fact
  const entryIndex = entries.findIndex((entry) => entry.check === 'region-truncated' && entry.subject === subject)
  if (entryIndex < 0) entries.push(result.entry)
  else entries[entryIndex] = result.entry
}

export function regionRefusal(subject: string, folio: string, excess: number): string {
  return `Region ${subject} on page ${folio} exceeds its block size by ${Math.ceil(excess)}px; enlarge the region or shorten its content to clear this refusal.`
}

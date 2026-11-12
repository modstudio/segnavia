import {
  FILL_MAX_DEFAULT,
  FILL_MIN_DEFAULT,
  PREFLIGHT_DROPPED_IDS_LIMIT,
  PREFLIGHT_REGION_FIELD_LIMIT,
  type PreflightEntry,
  type PreflightRegion,
  type RegionOverflow,
} from '@segnavia/format'

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
  const min = minimum === null ? FILL_MIN_DEFAULT : Number(minimum)
  const max = maximum === null ? FILL_MAX_DEFAULT : Number(maximum)
  if (!Number.isSafeInteger(min) || min < 1) throw new Error('data-fill-min must be a positive integer')
  if (!Number.isSafeInteger(max) || max < 1 || max > PREFLIGHT_REGION_FIELD_LIMIT)
    throw new Error(`data-fill-max must be a positive integer no greater than ${PREFLIGHT_REGION_FIELD_LIMIT}`)
  return { min, max }
}

export function overflowMode(region: Pick<Element, 'getAttribute'>): RegionOverflow {
  return (region.getAttribute('data-overflow') ?? 'grow') as RegionOverflow
}

export function mergeRegionFact(facts: PreflightRegion[], fact: PreflightRegion): void {
  const index = facts.findIndex((candidate) => candidate.subject === fact.subject)
  if (index < 0) {
    facts.push(fact)
    return
  }
  const previous = facts[index] as PreflightRegion
  const counts = [previous.fillCount, fact.fillCount].filter((value): value is number => value !== undefined)
  facts[index] = { ...previous, ...fact, ...(counts.length === 0 ? {} : { fillCount: Math.min(...counts) }) }
}

export function lastLineStart(blockPositions: readonly number[], tolerance = 0.5): number {
  if (blockPositions.length === 0) return -1
  const last = blockPositions[blockPositions.length - 1] as number
  let index = blockPositions.length - 1
  while (index > 0 && Math.abs((blockPositions[index - 1] as number) - last) <= tolerance) index -= 1
  return index
}

export function truncatedRegion(
  subject: string,
  droppedIds: readonly string[],
  folio: string,
  previous?: PreflightRegion,
  idLimit = PREFLIGHT_DROPPED_IDS_LIMIT,
): { fact: PreflightRegion; entry: PreflightEntry } {
  const droppedPages = (previous?.droppedPages ?? 0) + 1
  const droppedBlocks = (previous?.droppedBlocks ?? 0) + droppedIds.length
  const dropped = [...(previous?.droppedIds ?? []), ...droppedIds].slice(0, idLimit)
  return {
    fact: { subject, droppedPages, droppedBlocks, droppedIds: dropped, droppedTotal: droppedBlocks },
    entry: {
      check: 'region-truncated',
      subject,
      message: `Region ${subject} was truncated on ${droppedPages} page${droppedPages === 1 ? '' : 's'}; ${droppedBlocks} blocks were dropped; shorten the region's content, enlarge the region, or set data-overflow="grow" to clear it.`,
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
  const previous = facts.find((fact) => fact.subject === subject)
  const result = truncatedRegion(subject, droppedIds, folio, previous)
  mergeRegionFact(facts, result.fact)
  const entryIndex = entries.findIndex((entry) => entry.check === 'region-truncated' && entry.subject === subject)
  if (entryIndex < 0) entries.push(result.entry)
  else entries[entryIndex] = result.entry
}

export function regionRefusal(subject: string, folio: string, excess: number): string {
  return `Region ${subject} on page ${folio} exceeds its block size by ${Math.ceil(excess)}px; enlarge the region or shorten its content to clear this refusal.`
}

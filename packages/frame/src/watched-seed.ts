export interface WatchedSeedSpan {
  startMs: number
  endMs: number
}

export interface WatchedSeedEntry {
  slideId: string
  reached: boolean
  watchedThrough: boolean
  spans?: readonly WatchedSeedSpan[]
}

export type WatchedSeed = readonly WatchedSeedEntry[]

const ENTRY_LIMIT = 10_000
const SLIDE_ID_LIMIT = 256
const SPAN_LIMIT = 1_000

function refusal(path: string, requirement: string, fix: string): RangeError {
  return new RangeError(`${path} ${requirement}; ${fix} to clear this refusal.`)
}

function parseSpan(input: unknown, entryIndex: number, spanIndex: number): WatchedSeedSpan {
  const path = `watched[${entryIndex}].spans[${spanIndex}]`
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw refusal(path, 'must be an object', `pass { startMs, endMs } for ${path}`)
  const span = input as Record<string, unknown>
  for (const field of ['startMs', 'endMs'] as const) {
    const value = span[field]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      throw refusal(`${path}.${field}`, 'must be a finite non-negative number', `pass a finite number at least 0 for ${path}.${field}`)
  }
  const startMs = span.startMs as number
  const endMs = span.endMs as number
  if (endMs < startMs) throw refusal(`${path}.endMs`, `must be at least ${path}.startMs`, `pass an endMs of ${startMs} or greater`)
  return { startMs, endMs }
}

function parseEntry(input: unknown, index: number): WatchedSeedEntry {
  const path = `watched[${index}]`
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw refusal(path, 'must be an object', `pass { slideId, reached, watchedThrough } for ${path}`)
  const entry = input as Record<string, unknown>
  if (typeof entry.slideId !== 'string' || entry.slideId.length < 1 || entry.slideId.length > SLIDE_ID_LIMIT)
    throw refusal(`${path}.slideId`, `must be a string from 1 to ${SLIDE_ID_LIMIT} characters`, `pass a stored slide id for ${path}.slideId`)
  for (const field of ['reached', 'watchedThrough'] as const) {
    if (typeof entry[field] !== 'boolean') throw refusal(`${path}.${field}`, 'must be a boolean', `pass true or false for ${path}.${field}`)
  }
  if (entry.spans === undefined) return { slideId: entry.slideId, reached: entry.reached as boolean, watchedThrough: entry.watchedThrough as boolean }
  if (!Array.isArray(entry.spans)) throw refusal(`${path}.spans`, 'must be an array', `pass at most ${SPAN_LIMIT} spans for ${path}.spans`)
  if (entry.spans.length > SPAN_LIMIT)
    throw refusal(`${path}.spans`, `has ${entry.spans.length} entries, more than the ${SPAN_LIMIT} allowed`, `pass at most ${SPAN_LIMIT} spans`)
  return {
    slideId: entry.slideId,
    reached: entry.reached as boolean,
    watchedThrough: entry.watchedThrough as boolean,
    spans: entry.spans.map((span, spanIndex) => parseSpan(span, index, spanIndex)),
  }
}

export function validateWatchedSeed(input: unknown): WatchedSeed {
  if (!Array.isArray(input)) throw refusal('watched', 'must be an array', `pass at most ${ENTRY_LIMIT} entries`)
  if (input.length > ENTRY_LIMIT)
    throw refusal('watched', `has ${input.length} entries, more than the ${ENTRY_LIMIT} allowed`, `pass at most ${ENTRY_LIMIT} entries`)
  const seen = new Map<string, number>()
  return input.map((candidate, index) => {
    const entry = parseEntry(candidate, index)
    const previous = seen.get(entry.slideId)
    if (previous !== undefined)
      throw refusal(`watched[${index}].slideId`, `repeats watched[${previous}].slideId ${JSON.stringify(entry.slideId)}`, 'pass each slide id only once')
    seen.set(entry.slideId, index)
    return entry
  })
}

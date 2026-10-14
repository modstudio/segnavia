import { z } from 'zod'

export const MAX_SLIDE_TIMING_MS = 600_000
export const SlideTiming = z.number().finite().min(0).max(MAX_SLIDE_TIMING_MS)

export function slideTimingIssues(slide: {
  narration?: unknown
  beforeMs?: number
  afterMs?: number
  holdMs?: number
}): Array<'beforeMs' | 'afterMs' | 'holdMs'> {
  if (slide.narration) return slide.holdMs === undefined ? [] : ['holdMs']
  return (['beforeMs', 'afterMs'] as const).filter((field) => slide[field] !== undefined)
}

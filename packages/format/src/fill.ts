import { z } from 'zod'

export const FillMode = z.enum(['repeat'])
export type FillMode = z.infer<typeof FillMode>

export const RegionOverflow = z.enum(['grow', 'truncate', 'refuse'])
export type RegionOverflow = z.infer<typeof RegionOverflow>

export const FILL_MIN_DEFAULT = 1
export const FILL_MAX_DEFAULT = 10_000

export interface PreflightRegion {
  readonly subject: string
  readonly fillCount?: number
  readonly droppedPages?: number
  readonly droppedBlocks?: number
  readonly droppedIds?: readonly string[]
  readonly droppedTotal?: number
}

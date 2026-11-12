import { z } from 'zod'

export const FillMode = z.enum(['repeat'])
export type FillMode = z.infer<typeof FillMode>

export const RegionOverflow = z.enum(['grow', 'truncate', 'refuse'])
export type RegionOverflow = z.infer<typeof RegionOverflow>

export const PREFLIGHT_REGIONS_LIMIT = 256
export const PREFLIGHT_DROPPED_IDS_LIMIT = 50
export const PREFLIGHT_REGION_COUNT_LIMIT = 10_000
export const PREFLIGHT_REGION_ID_LIMIT = 256

export interface PreflightRegion {
  readonly subject: string
  readonly fillCount?: number
  readonly droppedPages?: number
  readonly droppedBlocks?: number
  readonly droppedIds?: readonly string[]
  readonly droppedTotal?: number
}

import { z } from 'zod'

export const REGION_NAME = /^[A-Za-z][\w-]*$/

export const RegionEdge = z.enum(['blockStart', 'blockEnd', 'inlineStart', 'inlineEnd'], {
  error: 'a parent-page region edge must be blockStart, blockEnd, inlineStart or inlineEnd',
})
export type RegionEdge = z.infer<typeof RegionEdge>

export const ParentRegion = z.object({ edge: RegionEdge, html: z.string() })
export type ParentRegion = z.infer<typeof ParentRegion>

export const ParentRegions = z.record(
  z.string().regex(REGION_NAME, 'a parent-page region name must use a letter followed by letters, digits, hyphens or underscores'),
  ParentRegion,
)
export type ParentRegions = z.infer<typeof ParentRegions>

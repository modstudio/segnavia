import { z } from 'zod'

export const MEASURE_KINDS = ['max-content-inline:children', 'block', 'line-count'] as const
export const MeasureKind = z.enum(MEASURE_KINDS)
export type MeasureKind = z.infer<typeof MeasureKind>

export const MeasuredProperty = z.object({
  id: z.string(),
  name: z.string(),
  value: z.string(),
})
export type MeasuredProperty = z.infer<typeof MeasuredProperty>

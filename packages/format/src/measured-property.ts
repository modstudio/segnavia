import { z } from 'zod'

export const MEASURE_KIND_MODEL = {
  'max-content-inline:children': { unit: 'px' },
  block: { unit: 'px' },
  'line-count': { unit: '' },
} as const
export const MEASURE_KINDS = Object.keys(MEASURE_KIND_MODEL) as [keyof typeof MEASURE_KIND_MODEL, ...(keyof typeof MEASURE_KIND_MODEL)[]]
export const MeasureKind = z.enum(MEASURE_KINDS)
export type MeasureKind = z.infer<typeof MeasureKind>

export const MeasuredProperty = z
  .object({
    id: z.string(),
    name: z.string(),
    kind: MeasureKind,
    value: z.number().nonnegative(),
    unit: z.enum(['px', '']),
  })
  .superRefine((property, context) => {
    if (property.unit !== MEASURE_KIND_MODEL[property.kind].unit) {
      context.addIssue({ code: 'custom', message: `${property.kind} measurements use ${JSON.stringify(MEASURE_KIND_MODEL[property.kind].unit)}` })
    }
  })
export type MeasuredProperty = z.infer<typeof MeasuredProperty>

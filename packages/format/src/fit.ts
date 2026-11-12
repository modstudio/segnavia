import { z } from 'zod'

export const FIT_STRATEGIES = ['size', 'leading', 'tracking'] as const
export const FitStrategy = z.enum(FIT_STRATEGIES)
export type FitStrategy = z.infer<typeof FitStrategy>

export const FitAxis = z.enum(['block', 'inline', 'both'])
export type FitAxis = z.infer<typeof FitAxis>

export const FitBox = z.enum(['self', 'parent'])
export type FitBox = z.infer<typeof FitBox>

export const FitValue = z.object({ strategy: FitStrategy, value: z.number(), unit: z.string() })
export type FitValue = z.infer<typeof FitValue>

export const FitMeasurement = z.object({
  id: z.string(),
  group: z.string().optional(),
  values: z.array(FitValue),
  stopped: z.object({ strategy: FitStrategy, bound: z.number(), excess: z.number() }).optional(),
})
export type FitMeasurement = z.infer<typeof FitMeasurement>

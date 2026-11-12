import { z } from 'zod'
import { NumberSystem } from './numbering.ts'

export const LineNumberArea = z.enum(['text', 'margin'])
export const LineNumberSide = z.enum(['outer', 'inner', 'start', 'end'])
export const LineNumbers = z.object({
  interval: z.number().int().positive().default(5),
  start: z.number().int().positive().default(1),
  restart: z.enum(['page', 'section', 'never']).default('section'),
  system: NumberSystem.optional(),
  area: LineNumberArea.default('text'),
  side: LineNumberSide.default('outer'),
})
export type LineNumbers = z.infer<typeof LineNumbers>

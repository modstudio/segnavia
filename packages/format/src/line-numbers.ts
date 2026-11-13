import { z } from 'zod'
import { closedObject } from './closed-object.ts'
import { NumberSystem } from './numbering.ts'

export const LineNumberArea = z.enum(['text', 'margin'])
export const LineNumberSide = z.enum(['outer', 'inner', 'start', 'end'])
export const SideNotes = closedObject({
  area: z.literal('margin', { error: 'sideNotes.area must be margin; use margin to clear this refusal' }).default('margin'),
  side: LineNumberSide.default('outer'),
})
export type SideNotes = z.infer<typeof SideNotes>
export const LineNumbers = closedObject({
  interval: z.number().int().positive().default(5),
  start: z.number().int().positive().default(1),
  restart: z.enum(['page', 'section', 'never']).default('section'),
  system: NumberSystem.optional(),
  area: LineNumberArea.default('text'),
  side: LineNumberSide.default('outer'),
})
export type LineNumbers = z.infer<typeof LineNumbers>

export type ResolvedLineNumbers = LineNumbers & { system: z.infer<typeof NumberSystem> }

export function resolveLineNumbers(settings: LineNumbers, bodySystem: z.infer<typeof NumberSystem>): ResolvedLineNumbers {
  return { ...settings, system: settings.system ?? bodySystem }
}

import { z } from 'zod'
import type { TextDirection } from './direction.ts'

export const LogicalMargin = z.object({
  blockStart: z.number().nonnegative().default(0),
  blockEnd: z.number().nonnegative().default(0),
  inlineStart: z.number().nonnegative().default(0),
  inlineEnd: z.number().nonnegative().default(0),
})
export type LogicalMargin = z.infer<typeof LogicalMargin>

export const PhysicalMargin = z.object({
  top: z.number().nonnegative().default(0),
  right: z.number().nonnegative().default(0),
  bottom: z.number().nonnegative().default(0),
  left: z.number().nonnegative().default(0),
})
export type PhysicalMargin = z.infer<typeof PhysicalMargin>

export const PAGE_SIDES = ['recto', 'verso'] as const
export type PageSide = (typeof PAGE_SIDES)[number]

export function physicalMargins(margin: LogicalMargin, direction: TextDirection, side: PageSide): PhysicalMargin {
  const startOnLeft = (direction === 'ltr') === (side === 'recto')
  return {
    top: margin.blockStart,
    right: startOnLeft ? margin.inlineEnd : margin.inlineStart,
    bottom: margin.blockEnd,
    left: startOnLeft ? margin.inlineStart : margin.inlineEnd,
  }
}

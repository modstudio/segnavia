import { z } from 'zod'
import { closedObject } from './closed-object.ts'
import type { TextDirection } from './direction.ts'

/** Binding-relative margins; inlineStart is the binding edge, not CSS inline-start, and inlineEnd is the outer edge. */
export const LogicalMargin = closedObject({
  blockStart: z.number().nonnegative().default(0),
  blockEnd: z.number().nonnegative().default(0),
  inlineStart: z.number().nonnegative().default(0),
  inlineEnd: z.number().nonnegative().default(0),
})
export type LogicalMargin = z.infer<typeof LogicalMargin>

const requiredLogicalMarginShape = {
  blockStart: LogicalMargin.shape.blockStart.removeDefault(),
  blockEnd: LogicalMargin.shape.blockEnd.removeDefault(),
  inlineStart: LogicalMargin.shape.inlineStart.removeDefault(),
  inlineEnd: LogicalMargin.shape.inlineEnd.removeDefault(),
}

/** The complete logical margin required for a content area. */
export const RequiredLogicalMargin = z.strictObject(requiredLogicalMarginShape, {
  error: (issue) =>
    issue.code === 'unrecognized_keys'
      ? 'logical margin keys could not be accepted; use blockStart, blockEnd, inlineStart and inlineEnd to clear this refusal'
      : undefined,
})

export const PhysicalMargin = closedObject({
  top: z.number().nonnegative().default(0),
  right: z.number().nonnegative().default(0),
  bottom: z.number().nonnegative().default(0),
  left: z.number().nonnegative().default(0),
})
export type PhysicalMargin = z.infer<typeof PhysicalMargin>

export type PageSide = 'recto' | 'verso'

/** Maps binding-relative margins to physical edges; a single-sided page is a recto. */
export function physicalMargins(margin: LogicalMargin, direction: TextDirection, side: PageSide): PhysicalMargin {
  const startOnLeft = (direction === 'ltr') === (side === 'recto')
  return {
    top: margin.blockStart,
    right: startOnLeft ? margin.inlineEnd : margin.inlineStart,
    bottom: margin.blockEnd,
    left: startOnLeft ? margin.inlineStart : margin.inlineEnd,
  }
}

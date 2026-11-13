import { z } from 'zod'
import { closedObject } from './closed-object.ts'

export const PixelSize = closedObject({
  width: z
    .number()
    .int('size.width could not be accepted; pass a positive whole-pixel width to clear this refusal')
    .positive('size.width could not be accepted; pass a positive whole-pixel width to clear this refusal'),
  height: z
    .number()
    .int('size.height could not be accepted; pass a positive whole-pixel height to clear this refusal')
    .positive('size.height could not be accepted; pass a positive whole-pixel height to clear this refusal'),
})
/** An authored canvas size, in a whole number of CSS pixels. */
export type PixelSize = z.infer<typeof PixelSize>

export const MeasuredSize = closedObject({
  width: z.number().positive().finite(),
  height: z.number().positive().finite(),
})
/** A measured laid-out box, in CSS pixels; measurements may be fractional. */
export type MeasuredSize = z.infer<typeof MeasuredSize>

export const Box = closedObject({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
export type Box = z.infer<typeof Box>

export const Point = closedObject({ x: z.number(), y: z.number() })
export type Point = z.infer<typeof Point>

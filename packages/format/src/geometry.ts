import { z } from 'zod'

export const PixelSize = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})
/** An authored canvas size, in a whole number of CSS pixels. */
export type PixelSize = z.infer<typeof PixelSize>

export const MeasuredSize = z.object({
  width: z.number().positive().finite(),
  height: z.number().positive().finite(),
})
/** A measured laid-out box, in CSS pixels; measurements may be fractional. */
export type MeasuredSize = z.infer<typeof MeasuredSize>

export const Box = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
export type Box = z.infer<typeof Box>

export const Point = z.object({ x: z.number(), y: z.number() })
export type Point = z.infer<typeof Point>

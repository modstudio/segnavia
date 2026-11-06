import { z } from 'zod'

export const PixelSize = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})
export type PixelSize = z.infer<typeof PixelSize>

export const Box = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
export type Box = z.infer<typeof Box>

export const Point = z.object({ x: z.number(), y: z.number() })
export type Point = z.infer<typeof Point>

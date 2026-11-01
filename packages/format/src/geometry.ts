import { z } from 'zod'

export const Size = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})
export type Size = z.infer<typeof Size>

export const Box = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
export type Box = z.infer<typeof Box>

export const Point = z.object({ x: z.number(), y: z.number() })
export type Point = z.infer<typeof Point>

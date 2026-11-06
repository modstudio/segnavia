import { z } from 'zod'

export const DocumentLimits = z.object({
  maxSlides: z.number().int().nonnegative().optional(),
  maxSlideBytes: z.number().int().nonnegative().optional(),
  maxNotesBytes: z.number().int().nonnegative().optional(),
})

export type DocumentLimits = z.infer<typeof DocumentLimits>

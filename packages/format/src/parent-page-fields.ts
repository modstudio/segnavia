import { z } from 'zod'

export const RemovedParentPageFields = {
  head: z.never({ error: 'parent page head was removed; use regions with a head (blockStart) region to clear this refusal' }).optional(),
  foot: z.never({ error: 'parent page foot was removed; use regions with a foot (blockEnd) region to clear this refusal' }).optional(),
}

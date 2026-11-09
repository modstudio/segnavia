import { z } from 'zod'

export const BookOpens = z.enum(['recto', 'verso', 'any', 'continue'])
export type BookOpens = z.infer<typeof BookOpens>

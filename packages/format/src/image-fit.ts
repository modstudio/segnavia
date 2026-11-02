import { z } from 'zod'

export const ImageFit = z.enum(['contain', 'cover', 'width', 'focus'])
export type ImageFit = z.infer<typeof ImageFit>

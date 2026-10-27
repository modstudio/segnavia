import { z } from 'zod'

const FontReferenceShape = z.union([z.object({ app: z.string().min(1) }), z.object({ local: z.string().min(1), fallback: z.string().min(1) })])
const FontReferenceInputShape = z.union([z.strictObject({ app: z.string().min(1) }), z.strictObject({ local: z.string().min(1), fallback: z.string().min(1) })])

export const FontReference = FontReferenceShape
export type FontReference = z.infer<typeof FontReference>

export const FontReferenceInput = FontReferenceInputShape
export type FontReferenceInput = z.input<typeof FontReferenceInput>

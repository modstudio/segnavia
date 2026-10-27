import { z } from 'zod'

const AppFontShape = { app: z.string().min(1) } as const
const LocalFontShape = { local: z.string().min(1), fallback: z.string().min(1) } as const

export const FontReference = z.union([z.object(AppFontShape), z.object(LocalFontShape)])
export type FontReference = z.infer<typeof FontReference>

export const FontReferenceInput = z.union([z.strictObject(AppFontShape), z.strictObject(LocalFontShape)])
export type FontReferenceInput = z.input<typeof FontReferenceInput>

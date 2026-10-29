import { z } from 'zod'

export const APP_FONT_NAME = /^[a-z0-9-]+$/
export const APP_FONT_NAME_MESSAGE = 'app font names are lowercase letters, digits and hyphens'

const AppFontName = z.string().min(1).regex(APP_FONT_NAME, APP_FONT_NAME_MESSAGE)

const AppFontShape = { app: AppFontName } as const
const LocalFontShape = { local: z.string().min(1), fallback: AppFontName } as const

export const FontReference = z.union([z.object(AppFontShape), z.object(LocalFontShape)])
export type FontReference = z.infer<typeof FontReference>

export const FontReferenceInput = z.union([z.strictObject(AppFontShape), z.strictObject(LocalFontShape)])
export type FontReferenceInput = z.input<typeof FontReferenceInput>

export function localFontReferences(references: readonly FontReference[]): Array<{ local: string; fallback: string }> {
  const seen = new Set<string>()
  const locals: Array<{ local: string; fallback: string }> = []
  for (const reference of references) {
    if (!('local' in reference)) continue
    const key = JSON.stringify(reference)
    if (seen.has(key)) continue
    seen.add(key)
    locals.push(reference)
  }
  return locals
}

export const FONT_FORMATS = ['woff2', 'woff', 'truetype', 'opentype'] as const
export type FontFormat = (typeof FONT_FORMATS)[number]

const LocalFaceTransportShape = {
  family: z.string().min(1),
  format: z.enum(FONT_FORMATS),
  // See FontFace.weight.
  weight: z.union([z.number(), z.string()]).optional(),
  style: z.enum(['normal', 'italic']).optional(),
  data: z.string(),
} as const

export const LocalFaceTransport = z.strictObject(LocalFaceTransportShape)
export type LocalFaceTransport = z.infer<typeof LocalFaceTransport>
export const LocalFacesTransport = z.array(LocalFaceTransport)
export type LocalFacesInput = LocalFaceTransport[]

export const FONT_GENERICS = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui'] as const
export type FontGeneric = (typeof FONT_GENERICS)[number]

export interface FontFace {
  family: string
  data: Uint8Array
  format: FontFormat
  // A CSS font-weight: 'normal' or 'bold', an integer 1-1000, or two such integers low then high separated by one space (a variable-font range).
  weight?: number | string
  style?: 'normal' | 'italic'
  unicodeRange?: string
}

export interface AppFont {
  family: string
  faces: FontFace[]
  generic?: FontGeneric
}

export interface FontSource {
  font(name: string, options: { signal: AbortSignal }): Promise<AppFont | undefined>
}

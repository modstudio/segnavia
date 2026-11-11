import { z } from 'zod'

export const APP_FONT_NAME = /^[a-z0-9-]+$/
export const APP_FONT_NAME_MESSAGE = 'app font names are lowercase letters, digits and hyphens'

const AppFontName = z.string().min(1).regex(APP_FONT_NAME, APP_FONT_NAME_MESSAGE)
export const FONT_GENERICS = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui'] as const
export type FontGeneric = (typeof FONT_GENERICS)[number]

export const HEBREW_UNICODE_RANGE = 'U+0590-05FF,U+FB1D-FB4F'

interface UnicodeRangePart {
  start: number
  end: number
}

function unicodeRangeParts(value: string): UnicodeRangePart[] | null {
  const parsed: UnicodeRangePart[] = []
  for (const part of value.split(',')) {
    const match = /^U\+([\dA-F?]{1,6})(?:-([\dA-F]{1,6}))?$/i.exec(part.trim())
    const source = match?.[1]
    if (!source || (source.includes('?') && match?.[2] !== undefined)) return null
    const start = Number.parseInt(source.replace(/\?/g, '0'), 16)
    const end = Number.parseInt(match?.[2] ?? source.replace(/\?/g, 'F'), 16)
    if (start > end || end > 0x10ffff) return null
    parsed.push({ start, end })
  }
  return parsed.length > 0 ? parsed : null
}

function validUnicodeRange(value: string): boolean {
  return unicodeRangeParts(value) !== null
}

export const FontDeclarationWeight = z.union([
  z
    .number()
    .int()
    .min(1, 'weight must be from 1 to 1000; use an integer in that range')
    .max(1000, 'weight must be from 1 to 1000; use an integer in that range'),
  z
    .tuple([
      z
        .number()
        .int()
        .min(1, 'weight must be from 1 to 1000; use integers in that range')
        .max(1000, 'weight must be from 1 to 1000; use integers in that range'),
      z
        .number()
        .int()
        .min(1, 'weight must be from 1 to 1000; use integers in that range')
        .max(1000, 'weight must be from 1 to 1000; use integers in that range'),
    ])
    .refine(([min, max]) => min <= max, 'weight range minimum must not exceed its maximum; put the lower weight first'),
])

const FontDeclarationShape = {
  weight: FontDeclarationWeight.optional(),
  style: z.enum(['normal', 'italic']).optional(),
  unicodeRange: z.string().min(1).refine(validUnicodeRange, 'must be a comma-separated CSS unicode range such as U+0590-05FF'),
  script: z.enum(['hebrew']).optional(),
} as const

export const FontDeclaration = z
  .strictObject({ ...FontDeclarationShape, unicodeRange: FontDeclarationShape.unicodeRange.optional() })
  .transform((face) => (face.script === 'hebrew' && face.unicodeRange === undefined ? { ...face, unicodeRange: HEBREW_UNICODE_RANGE } : face))
export type FontDeclaration = z.infer<typeof FontDeclaration>

export const AppFontDeclaration = z.strictObject({ faces: z.array(FontDeclaration).min(1), generic: z.enum(FONT_GENERICS).optional() })
export type AppFontDeclaration = z.infer<typeof AppFontDeclaration>

export const LocalFontDeclaration = z.strictObject({ local: z.string().min(1), fallback: AppFontName })
export type LocalFontDeclaration = z.infer<typeof LocalFontDeclaration>

export const FontManifestEntry = z.union([AppFontDeclaration, LocalFontDeclaration])
export type FontManifestEntry = z.infer<typeof FontManifestEntry>
export const FontManifest = z.record(AppFontName, FontManifestEntry).superRefine((fonts, ctx) => {
  for (const [font, entry] of Object.entries(fonts)) {
    if (!('faces' in entry)) continue
    const seen: Array<{ face: FontDeclaration; index: number }> = []
    for (const [index, face] of entry.faces.entries()) {
      const previous = seen.find(
        ({ face: candidate }) =>
          (candidate.style ?? 'normal') === (face.style ?? 'normal') &&
          (candidate.unicodeRange?.replace(/\s/g, '').toUpperCase() ?? '') === (face.unicodeRange?.replace(/\s/g, '').toUpperCase() ?? '') &&
          fontWeightRangesOverlap(fontWeightRange(candidate.weight), fontWeightRange(face.weight)),
      )
      if (previous === undefined) seen.push({ face, index })
      else {
        ctx.addIssue({
          code: 'custom',
          path: [font, 'faces', index],
          message: `font ${JSON.stringify(font)} face ${index} duplicates face ${previous.index} by overlapping weight, style and unicodeRange; change or remove that face to clear this refusal`,
        })
      }
    }
  }
})
export type FontManifest = z.infer<typeof FontManifest>

export interface ManifestWithReferences {
  manifest: FontManifest
  undeclared: string[]
}

export function fontManifestReferences(fonts: FontManifest | undefined, undeclared: readonly string[] = []): FontReference[] {
  const references = Object.entries(fonts ?? {}).map(([name, declaration]) => ('local' in declaration ? declaration : { app: name }))
  const declared = new Set(references.flatMap((reference) => ('app' in reference ? [reference.app] : [])))
  for (const name of undeclared) if (!declared.has(name)) references.push({ app: name })
  return references
}

export function fontManifestWithReferences(fonts: FontManifest | undefined, references: readonly FontReference[]): ManifestWithReferences {
  const manifest: FontManifest = { ...fonts }
  const undeclared: string[] = []
  for (const reference of references) {
    if ('app' in reference) {
      if (!(reference.app in manifest) && !undeclared.includes(reference.app)) undeclared.push(reference.app)
      continue
    }
    if (Object.values(manifest).some((entry) => 'local' in entry && entry.local === reference.local && entry.fallback === reference.fallback)) continue
    let index = 0
    while (`local-${index}` in manifest) index++
    manifest[`local-${index}`] = reference
  }
  return { manifest, undeclared }
}

/** Declares the default face when a reference-only boundary persists a document. */
export function persistedFontManifestWithReferences(fonts: FontManifest | undefined, references: readonly FontReference[]): FontManifest {
  const { manifest, undeclared } = fontManifestWithReferences(fonts, references)
  for (const name of undeclared) manifest[name] = { faces: [{}] }
  return manifest
}

export interface FontFailure {
  font: string
  family: string
  weight?: number | [number, number]
  style?: string
  unicodeRange?: string
  reason: 'unsupplied' | 'unloaded'
}

const AppFontShape = { app: AppFontName } as const
const LocalFontShape = { local: z.string().min(1), fallback: AppFontName } as const

export const FontReference = z.union([z.object(AppFontShape), z.object(LocalFontShape)])
export type FontReference = z.infer<typeof FontReference>
export type FontReferencesSource = readonly FontReference[] | FontManifest | undefined

export const FontReferenceInput = z.union([z.strictObject(AppFontShape), z.strictObject(LocalFontShape)])
export type FontReferenceInput = z.input<typeof FontReferenceInput>

export function localFontReferences(fonts: FontReferencesSource): LocalFontDeclaration[] {
  const references = Array.isArray(fonts) ? fonts : fontManifestReferences(fonts as FontManifest | undefined)
  const seen = new Set<string>()
  const locals: LocalFontDeclaration[] = []
  for (const reference of references) {
    if (!('local' in reference)) continue
    const key = JSON.stringify(reference)
    if (seen.has(key)) continue
    seen.add(key)
    locals.push(reference)
  }
  return locals
}

export const FONT_FORMATS = ['woff2', 'woff', 'truetype', 'opentype', 'collection'] as const
export type FontFormat = (typeof FONT_FORMATS)[number]

const LocalFaceTransportShape = {
  family: z.string().min(1),
  format: z.enum(FONT_FORMATS),
  // See FontFace.weight.
  weight: z.union([z.number(), z.string()]).optional(),
  style: z.enum(['normal', 'italic']).optional(),
  postscriptName: z.string().min(1).optional(),
  data: z.string(),
} as const

export const LocalFaceTransport = z.strictObject(LocalFaceTransportShape)
export type LocalFaceTransport = z.infer<typeof LocalFaceTransport>
export const LocalFacesTransport = z.array(LocalFaceTransport)
export type LocalFacesInput = LocalFaceTransport[]

export interface FontFace {
  family: string
  data: Uint8Array
  format: FontFormat
  // A CSS font-weight: 'normal' or 'bold', an integer 1-1000, or two such integers low then high separated by one space (a variable-font range).
  weight?: number | string
  style?: 'normal' | 'italic'
  unicodeRange?: string
  postscriptName?: string
}

export interface AppFont {
  family: string
  faces: FontFace[]
  generic?: FontGeneric
  present?: true
}

export interface FontSource {
  font(name: string, options: { signal: AbortSignal }): Promise<AppFont | undefined>
}

export type FontWeightRange = readonly [number, number]

export function fontWeightRange(weight: FontDeclaration['weight'] | FontFace['weight']): FontWeightRange | null {
  if (weight === undefined || weight === 'normal') return [400, 400]
  if (weight === 'bold') return [700, 700]
  if (typeof weight === 'number') return Number.isInteger(weight) && weight >= 1 && weight <= 1000 ? [weight, weight] : null
  if (Array.isArray(weight)) return [weight[0], weight[1]]
  const match = /^([1-9]\d{0,2}|1000)(?: ([1-9]\d{0,2}|1000))?$/.exec(weight)
  if (!match?.[1]) return null
  const min = Number(match[1])
  const max = Number(match[2] ?? match[1])
  return min <= max ? [min, max] : null
}

export function fontWeightRangeCovers(candidate: FontWeightRange | null, declaration: FontWeightRange | null): boolean {
  return candidate !== null && declaration !== null && candidate[0] <= declaration[0] && candidate[1] >= declaration[1]
}

function fontWeightRangesOverlap(left: FontWeightRange | null, right: FontWeightRange | null): boolean {
  return left !== null && right !== null && left[0] <= right[1] && right[0] <= left[1]
}

function faceKey(face: Pick<FontDeclaration, 'style' | 'unicodeRange'> | Pick<FontFace, 'style' | 'unicodeRange'>): string {
  return JSON.stringify([face.style ?? 'normal', face.unicodeRange?.replace(/\s/g, '').toUpperCase() ?? ''])
}

function faceMatches(declaration: FontDeclaration, supplied: FontFace): boolean {
  if (
    !fontWeightRangeCovers(fontWeightRange(supplied.weight), fontWeightRange(declaration.weight)) ||
    (declaration.style ?? 'normal') !== (supplied.style ?? 'normal')
  )
    return false
  return supplied.unicodeRange === undefined || faceKey(declaration) === faceKey(supplied)
}

export function matchFaces(declared: readonly FontDeclaration[], supplied: readonly FontFace[]): { faces: FontFace[]; unsupplied: FontDeclaration[] } {
  const used = new Set<number>()
  const faces: FontFace[] = []
  const unsupplied: FontDeclaration[] = []
  for (const declaration of declared) {
    const index = supplied.findIndex((face) => faceMatches(declaration, face))
    if (index < 0) unsupplied.push(declaration)
    else if (!used.has(index)) {
      used.add(index)
      faces.push(supplied[index] as FontFace)
    }
  }
  return { faces: [...faces, ...supplied.filter((_, index) => !used.has(index))], unsupplied }
}

const HEBREW_SAMPLE = '\u05d0\u05b0\u0591\u05ea\u05b8\u05bd'

function rangeIncludes(range: string, codePoint: number): boolean {
  for (const { start, end } of unicodeRangeParts(range) ?? []) {
    if (codePoint >= start && codePoint <= end) return true
  }
  return false
}

export function rangeSample(range?: string): string {
  if (range && [0x0591, 0x05b0, 0x05d0].some((codePoint) => rangeIncludes(range, codePoint))) return HEBREW_SAMPLE
  if (!range) return 'Aa'
  const first = unicodeRangeParts(range)?.[0]
  return first ? String.fromCodePoint(first.start) : 'Aa'
}

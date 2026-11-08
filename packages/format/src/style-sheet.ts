import { z } from 'zod'
import { FontManifest } from './fonts.ts'
import { RequiredLogicalMargin } from './margins.ts'
import { Motif } from './motif.ts'
import { Orientation, Paper } from './paper.ts'

export const STYLE_NAME = /^[a-z][a-z0-9-]*$/
const StyleName = z.string().regex(STYLE_NAME, 'names must start with a lowercase letter and contain only lowercase letters, digits and hyphens')

export const HexColor = z.string().regex(/^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i, 'colors must be #rgb, #rrggbb or #rrggbbaa')
export type HexColor = z.infer<typeof HexColor>

export const Dimension = z.object({
  value: z.number(),
  unit: z.enum(['pt', 'px', 'mm', 'cm', 'in', 'em', 'rem']),
})
export type Dimension = z.infer<typeof Dimension>

export const TokenReference = z.object({ token: StyleName })
export type TokenReference = z.infer<typeof TokenReference>

export type TextStyleKind = 'paragraph' | 'character'
export type TextStyleTokenGroup = 'colors' | 'dimensions' | 'fontFamilies'

const DimensionValue = z.union([TokenReference, Dimension])
const TextStyleShape = {
  kind: z.enum(['paragraph', 'character']),
  basedOn: StyleName.optional(),
  fontFamily: z.union([TokenReference, z.array(z.string().min(1)).min(1)]).optional(),
  fontSize: DimensionValue.optional(),
  lineHeight: z.union([z.number(), TokenReference, Dimension]).optional(),
  fontWeight: z.number().int().min(100).max(900).multipleOf(100).optional(),
  fontStyle: z.enum(['normal', 'italic']).optional(),
  color: z.union([TokenReference, HexColor]).optional(),
  letterSpacing: DimensionValue.optional(),
  textAlign: z.enum(['start', 'end', 'center', 'justify']).optional(),
  spaceBefore: DimensionValue.optional(),
  spaceAfter: DimensionValue.optional(),
  indent: DimensionValue.optional(),
  keepWithNext: z.boolean().optional(),
} as const

export const KEEP_WITH_CUSTOM_PROPERTY = '--segnavia-keep-with'

type TextStyleProperty = Exclude<keyof typeof TextStyleShape, 'kind' | 'basedOn'>
type TextStylePropertyFact = { kinds: readonly TextStyleKind[]; tokenGroup?: TextStyleTokenGroup; cssProperty: string }

export const TEXT_STYLE_PROPERTIES = {
  fontFamily: { kinds: ['paragraph', 'character'], tokenGroup: 'fontFamilies', cssProperty: 'font-family' },
  fontSize: { kinds: ['paragraph', 'character'], tokenGroup: 'dimensions', cssProperty: 'font-size' },
  lineHeight: { kinds: ['paragraph', 'character'], tokenGroup: 'dimensions', cssProperty: 'line-height' },
  fontWeight: { kinds: ['paragraph', 'character'], cssProperty: 'font-weight' },
  fontStyle: { kinds: ['paragraph', 'character'], cssProperty: 'font-style' },
  color: { kinds: ['paragraph', 'character'], tokenGroup: 'colors', cssProperty: 'color' },
  letterSpacing: { kinds: ['paragraph', 'character'], tokenGroup: 'dimensions', cssProperty: 'letter-spacing' },
  textAlign: { kinds: ['paragraph'], cssProperty: 'text-align' },
  spaceBefore: { kinds: ['paragraph'], tokenGroup: 'dimensions', cssProperty: 'margin-block-start' },
  spaceAfter: { kinds: ['paragraph'], tokenGroup: 'dimensions', cssProperty: 'margin-block-end' },
  indent: { kinds: ['paragraph'], tokenGroup: 'dimensions', cssProperty: 'text-indent' },
  keepWithNext: { kinds: ['paragraph'], cssProperty: KEEP_WITH_CUSTOM_PROPERTY },
} as const satisfies Record<TextStyleProperty, TextStylePropertyFact>

export const TextStyle = z.object(TextStyleShape).superRefine((style, ctx) => {
  for (const [property, fact] of Object.entries(TEXT_STYLE_PROPERTIES)) {
    if (style[property as keyof typeof style] !== undefined && !fact.kinds.some((kind) => kind === style.kind)) {
      ctx.addIssue({
        code: 'custom',
        path: [property],
        message: `${property} is not allowed on a ${style.kind} text style; remove ${property} or change kind to ${fact.kinds.join(' or ')} to clear this refusal`,
      })
    }
  }
})
export type TextStyle = z.infer<typeof TextStyle>

export const PageGeometry = z.object({
  paper: Paper,
  orientation: Orientation,
  margin: RequiredLogicalMargin,
  columns: z.object({ count: z.number().int().min(1), gap: z.number().nonnegative() }).optional(),
})
export type PageGeometry = z.infer<typeof PageGeometry>

const NamedRecord = <T extends z.ZodType>(value: T) => z.record(StyleName, value)

export const StyleSheet = z
  .object({
    tokens: z
      .object({
        colors: NamedRecord(HexColor).optional(),
        dimensions: NamedRecord(Dimension).optional(),
        fontFamilies: NamedRecord(z.array(z.string().min(1)).min(1)).optional(),
      })
      .optional(),
    textStyles: NamedRecord(TextStyle).optional(),
    pageGeometries: NamedRecord(PageGeometry).optional(),
    motifs: z.array(Motif).optional(),
    fonts: FontManifest.optional(),
    css: z.string().optional(),
  })
  .superRefine((sheet, ctx) => {
    const seen = new Map<string, number>()
    for (const [index, motif] of (sheet.motifs ?? []).entries()) {
      const previous = seen.get(motif.key)
      if (previous !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['motifs', index, 'key'],
          message: `motif key ${JSON.stringify(motif.key)} duplicates motifs.${previous}.key; give every motif a unique key to clear this refusal`,
        })
      } else seen.set(motif.key, index)
    }
  })
export type StyleSheet = z.infer<typeof StyleSheet>

import { z } from 'zod'
import { closedObject } from './closed-object.ts'
import { APP_FONT_NAME, APP_FONT_NAME_MESSAGE, FONT_FORMATS, FONT_GENERICS, FontDeclaration, FontDeclarationWeight, HEBREW_UNICODE_RANGE } from './fonts.ts'

const CatalogFontName = z.string().min(1).regex(APP_FONT_NAME, APP_FONT_NAME_MESSAGE)

const CatalogFontFace = closedObject({
  src: z.string().min(1),
  format: z.enum(FONT_FORMATS),
  weight: FontDeclarationWeight.optional(),
  style: z.enum(['normal', 'italic']).optional(),
  postscriptName: z.string().min(1).optional(),
  unicodeRange: z
    .string()
    .min(1)
    .refine((value) => FontDeclaration.safeParse({ unicodeRange: value }).success, 'must be a comma-separated CSS unicode range such as U+0590-05FF')
    .optional(),
  script: z.enum(['hebrew']).optional(),
})
  .refine((face) => face.unicodeRange === undefined || face.script === undefined, {
    message: 'a font catalog face may have unicodeRange or script, but not both',
  })
  .transform(({ script, ...face }) => ({
    ...face,
    ...(script === 'hebrew' ? { unicodeRange: HEBREW_UNICODE_RANGE } : {}),
  }))

const CatalogFont = closedObject({
  family: z.string().min(1),
  faces: z.array(CatalogFontFace).min(1),
  generic: z.enum(FONT_GENERICS).optional(),
}).superRefine((font, ctx) => {
  for (const [index, face] of font.faces.entries()) {
    if (face.format !== 'collection' || face.postscriptName !== undefined) continue
    ctx.addIssue({
      code: 'custom',
      path: ['faces', index, 'postscriptName'],
      message: `font catalog family ${JSON.stringify(font.family)} face ${index} is a collection and requires postscriptName; provide the face's PostScript name to clear this refusal`,
    })
  }
})

export const FontCatalog = z.record(CatalogFontName, CatalogFont)
export type FontCatalog = z.input<typeof FontCatalog>
export type CatalogFontFace = FontCatalog[string]['faces'][number]

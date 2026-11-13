import { z } from 'zod'
import { closedObject } from './closed-object.ts'
import { Direction, resolveDirection, type TextDirection } from './direction.ts'
import { Box, PixelSize } from './geometry.ts'

export const MediaFormat = z.enum(['png', 'jpeg', 'gif', 'webp', 'svg', 'pdf', 'ai'])
export type MediaFormat = z.infer<typeof MediaFormat>

export const MEDIA_FORMATS: Record<MediaFormat, { pages: boolean; raster: boolean }> = {
  png: { pages: false, raster: true },
  jpeg: { pages: false, raster: true },
  gif: { pages: false, raster: true },
  webp: { pages: false, raster: true },
  svg: { pages: false, raster: false },
  pdf: { pages: true, raster: false },
  ai: { pages: true, raster: false },
}

export const MediaText = closedObject({ text: z.string().min(1), lang: z.string().optional(), dir: Direction.optional() })
export type MediaText = z.infer<typeof MediaText>

export function mediaTextDirection(text: MediaText): TextDirection {
  return resolveDirection(text.dir, text.lang, text.text)
}

export const PageSelector = z.union([z.string().trim().min(1), z.number().int().positive()])
export type PageSelector = z.infer<typeof PageSelector>

const PageBox = Box.superRefine((box, ctx) => {
  if (box.width <= 0) ctx.addIssue({ code: 'custom', path: ['width'], message: 'box width must be positive; pass a positive width to clear this refusal' })
  if (box.height <= 0) ctx.addIssue({ code: 'custom', path: ['height'], message: 'box height must be positive; pass a positive height to clear this refusal' })
})

export const PAGE_BOXES = ['media', 'crop', 'trim', 'bleed', 'art'] as const
export const PageBoxName = z.enum(PAGE_BOXES)
export type PageBoxName = z.infer<typeof PageBoxName>

const MediaPageBoxesShape = {
  media: PageBox,
  crop: PageBox.optional(),
  trim: PageBox.optional(),
  bleed: PageBox.optional(),
  art: PageBox.optional(),
} satisfies Record<PageBoxName, unknown>

export const MediaPage = z.object({
  name: z.string().min(1).optional(),
  boxes: z.object(MediaPageBoxesShape),
})
export type MediaPage = z.infer<typeof MediaPage>

export const PointSize = z.object({
  width: z.number().positive('size.width could not be accepted; pass a positive width to clear this refusal'),
  height: z.number().positive('size.height could not be accepted; pass a positive height to clear this refusal'),
})
/** An authored vector or document size measured in PostScript points. */
export type PointSize = z.infer<typeof PointSize>

const mediaFields = {
  pages: z.array(MediaPage).optional(),
  resolution: z.number().positive('resolution could not be accepted; pass a positive resolution to clear this refusal').optional(),
  alt: MediaText.optional(),
  caption: MediaText.optional(),
  credit: MediaText.optional(),
  derivedFrom: z.object({ address: z.string().min(1), page: PageSelector, name: z.string().min(1).optional() }).optional(),
}

const MediaShape = z.discriminatedUnion('format', [
  z.object({ format: z.enum(['png', 'jpeg', 'gif', 'webp']), size: PixelSize, ...mediaFields }),
  z.object({ format: z.enum(['svg', 'pdf', 'ai']), size: PointSize, ...mediaFields }),
])

export const Media = MediaShape.superRefine((media, ctx) => {
  const capabilities = MEDIA_FORMATS[media.format]
  if (media.pages !== undefined && !capabilities.pages) {
    ctx.addIssue({
      code: 'custom',
      path: ['pages'],
      message: `pages could not be accepted for ${media.format}; remove pages or use a format with pages to clear this refusal`,
    })
  }
  if (media.resolution !== undefined && !capabilities.raster) {
    ctx.addIssue({
      code: 'custom',
      path: ['resolution'],
      message: `resolution could not be accepted for ${media.format}; remove resolution or use a raster format to clear this refusal`,
    })
  }
  if (media.derivedFrom !== undefined && capabilities.pages) {
    ctx.addIssue({
      code: 'custom',
      path: ['derivedFrom'],
      message: `derivedFrom could not be accepted for ${media.format}; remove derivedFrom or use a format without pages to clear this refusal`,
    })
  }
})
export type Media = z.infer<typeof Media>
export type MediaInput = z.input<typeof Media>

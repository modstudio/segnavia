import type { Cover } from '@segnavia/format'
import { RenderRefusedError } from './errors.ts'
import type { ImageOptions } from './options.ts'
import { pageViewport } from './page-viewport.ts'

export const COVER_IMAGE_OMITTED = ['format', 'proof', 'scale', 'width'] as const
type CoverImageOmitted = (typeof COVER_IMAGE_OMITTED)[number]

export interface CoverImageOptions extends Omit<ImageOptions, CoverImageOmitted> {
  width: number
  format?: 'webp' | 'png'
}

export interface CoverImagePlan {
  height: number
  options: ImageOptions
}

export function coverImagePlan(cover: Cover, options: CoverImageOptions | null | undefined): CoverImagePlan {
  const width = options?.width
  if (!options || width === undefined || !Number.isInteger(width) || width <= 0) {
    throw new RenderRefusedError(`Cover image width is ${width}; use a positive integer pixel width to clear this refusal.`)
  }
  const omitted: ReadonlySet<string> = new Set(COVER_IMAGE_OMITTED)
  const rest = Object.fromEntries(Object.entries(options).filter(([key]) => !omitted.has(key)))
  const format = options.format ?? 'webp'
  const viewport = pageViewport(cover.page)
  return {
    height: Math.round((viewport.height * width) / viewport.width),
    options: { ...rest, format, scale: width / viewport.width },
  }
}

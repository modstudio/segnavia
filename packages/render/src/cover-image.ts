import { COVER_SHEET, type Cover } from '@segnavia/format'
import { RenderRefusedError } from './errors.ts'
import type { ImageOptions } from './options.ts'
import { pageViewport } from './page-viewport.ts'

export interface CoverImageOptions extends Omit<ImageOptions, 'dependencies' | 'dependencyOrigins' | 'format' | 'proof' | 'scale' | 'width'> {
  width: number
  format?: 'webp' | 'png'
}

export interface CoverImagePlan {
  height: number
  options: ImageOptions
}

export function coverImagePlan(cover: Cover, options: CoverImageOptions): CoverImagePlan {
  if (!Number.isInteger(options.width) || options.width <= 0) {
    throw new RenderRefusedError(`Cover image width is ${options.width}; use a positive integer pixel width to clear this refusal.`)
  }
  const supplied = options as CoverImageOptions & ImageOptions
  const { dependencies: _dependencies, dependencyOrigins: _dependencyOrigins, format = 'webp', proof: _proof, scale: _scale, width, ...rest } = supplied
  const viewport = pageViewport(cover.page)
  return {
    height: Math.round((width * COVER_SHEET.height) / COVER_SHEET.width),
    options: { ...rest, format, scale: width / viewport.width },
  }
}

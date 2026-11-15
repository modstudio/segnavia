import { type PageBoxName, parseLimits } from '@segnavia/format'
import { RenderRefusedError } from './errors.ts'
import { refuseUnknownOptions } from './render-option-keys.ts'
import type { PdfPageImageOptions } from './renderer.ts'

export interface ParsedPdfPageImageOptions extends PdfPageImageOptions {
  page: number
}

const PAGE_BOXES = new Set<PageBoxName>(['media', 'crop', 'bleed', 'trim', 'art'])

export function parsePdfPageImageOptions(options: PdfPageImageOptions): ParsedPdfPageImageOptions {
  refuseUnknownOptions('pdfPageImage', options)
  const page = options.page ?? 1
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new RenderRefusedError('pdfPageImage page needs to be a positive integer; pass a 1-based page number to clear this refusal.')
  }
  if (!Number.isSafeInteger(options.width) || options.width < 1) {
    throw new RenderRefusedError('pdfPageImage width needs to be a positive integer; pass a width in whole CSS pixels to clear this refusal.')
  }
  if (options.box !== undefined && !PAGE_BOXES.has(options.box)) {
    throw new RenderRefusedError(
      'pdfPageImage box needs to be media, crop, bleed, trim or art; pass a supported PDF page box or omit box to clear this refusal.',
    )
  }
  return { ...options, page, limits: parseLimits(options.limits, 'host') }
}

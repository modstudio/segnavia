import { parseAsOfInputs } from '@segnavia/html'
import type { CoverImageOptions } from './cover-image.ts'
import { RenderRefusedError } from './errors.ts'
import { type PageImageOptions, type ProofImageOptions, parseComposedRenderOptions, parseImageRenderOptions } from './options.ts'
import { parsePdfOptions } from './protection-options.ts'
import { refuseUnknownOptions } from './render-option-keys.ts'
import type { DeckPdfInputOptions, SlideImageInputOptions } from './renderer.ts'
import { parseWatermarkOption } from './watermark-options.ts'

export function parsePageImageOptions(options: PageImageOptions) {
  refuseUnknownOptions('pageImage', options)
  if (options.page !== undefined && (!Number.isInteger(options.page) || options.page <= 0)) {
    throw new RenderRefusedError('pageImage options.page needs to be a positive integer; pass a 1-based page number to clear this refusal.')
  }
  return parseImageRenderOptions(options, 'pageImage')
}

export function parseCoverImageOptions(options: CoverImageOptions): CoverImageOptions {
  refuseUnknownOptions('coverImage', options)
  return options
}

export function parseDeckPdfOptions(options: DeckPdfInputOptions) {
  refuseUnknownOptions('deckPdf', options)
  const parsed = parseAsOfInputs(parsePdfOptions(parseComposedRenderOptions(options), 'deckPdf'))
  return parseWatermarkOption(parsed, 'deckPdf')
}

export function parseSlideImageOptions(options: SlideImageInputOptions) {
  refuseUnknownOptions('slideImage', options)
  return parseAsOfInputs(parseImageRenderOptions(options, 'slideImage'))
}

export function parseProofImageOptions(options: ProofImageOptions): ProofImageOptions {
  refuseUnknownOptions('proofImage', options)
  return options
}

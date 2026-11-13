import { parseAsOfInputs } from '@segnavia/html'
import type { CoverImageOptions } from './cover-image.ts'
import { type PageImageOptions, type ProofImageOptions, parseComposedRenderOptions, parseImageRenderOptions } from './options.ts'
import { parsePdfOptions } from './protection-options.ts'
import {
  COVER_IMAGE_OPTION_KEYS,
  DECK_PDF_OPTION_KEYS,
  PAGE_IMAGE_OPTION_KEYS,
  PROOF_IMAGE_OPTION_KEYS,
  refuseUnknownOptions,
  SLIDE_IMAGE_OPTION_KEYS,
} from './render-option-keys.ts'
import type { DeckPdfInputOptions, SlideImageInputOptions } from './renderer.ts'
import { parseWatermarkOption } from './watermark-options.ts'

export function parsePageImageOptions(options: PageImageOptions) {
  refuseUnknownOptions('pageImage', options, PAGE_IMAGE_OPTION_KEYS)
  return parseImageRenderOptions(options, 'pageImage')
}

export function parseCoverImageOptions(options: CoverImageOptions): CoverImageOptions {
  refuseUnknownOptions('coverImage', options, COVER_IMAGE_OPTION_KEYS)
  return options
}

export function parseDeckPdfOptions(options: DeckPdfInputOptions) {
  refuseUnknownOptions('deckPdf', options, DECK_PDF_OPTION_KEYS)
  const parsed = parseAsOfInputs(parsePdfOptions(parseComposedRenderOptions(options), 'deckPdf'))
  return parseWatermarkOption(parsed, 'deckPdf')
}

export function parseSlideImageOptions(options: SlideImageInputOptions) {
  refuseUnknownOptions('slideImage', options, SLIDE_IMAGE_OPTION_KEYS)
  return parseAsOfInputs(parseImageRenderOptions(options, 'slideImage'))
}

export function parseProofImageOptions(options: ProofImageOptions): ProofImageOptions {
  refuseUnknownOptions('proofImage', options, PROOF_IMAGE_OPTION_KEYS)
  return options
}

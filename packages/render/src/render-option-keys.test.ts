import { expect, test } from 'bun:test'
import type { CoverImageOptions } from './cover-image.ts'
import type { PageImageOptions, ProofImageOptions } from './options.ts'
import type { PdfPermissions, PERMISSION_OPTION_KEYS, PROTECTION_OPTION_KEYS, Protection } from './protection-options.ts'
import {
  type BOOK_PDF_OPTION_KEYS,
  type BOOK_PLAN_OPTION_KEYS,
  type COVER_IMAGE_OPTION_KEYS,
  type DECK_PDF_OPTION_KEYS,
  type PAGE_IMAGE_OPTION_KEYS,
  type PAGE_PDF_OPTION_KEYS,
  type PAGES_PDF_OPTION_KEYS,
  type PROOF_IMAGE_OPTION_KEYS,
  type SLIDE_IMAGE_OPTION_KEYS,
  unknownOptionIssues,
} from './render-option-keys.ts'
import type { BookPdfOptions, BookPlanOptions, DeckPdfInputOptions, PagePdfOptions, PagesPdfInputOptions, SlideImageInputOptions } from './renderer.ts'
import type { WATERMARK_OPTION_KEYS, WATERMARK_POSITION_OPTION_KEYS, Watermark } from './watermark-options.ts'

test('unknown render option issues name the call and option path', () => {
  expect(unknownOptionIssues('bookPdf', { foo: 1 }, { plan: true })).toEqual(['bookPdf options.foo: unknown option "foo"; remove it to clear this refusal'])
  expect(unknownOptionIssues('bookPdf', { extra: true }, { print: true }, ['protection', 'permissions'])).toEqual([
    'bookPdf options.protection.permissions.extra: unknown option "extra"; remove it to clear this refusal',
  ])
})

type Same<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false

const exactBookPdfKeys: Same<keyof typeof BOOK_PDF_OPTION_KEYS, keyof BookPdfOptions> = true
const exactBookPlanKeys: Same<keyof typeof BOOK_PLAN_OPTION_KEYS, keyof BookPlanOptions> = true
const exactPagePdfKeys: Same<keyof typeof PAGE_PDF_OPTION_KEYS, keyof PagePdfOptions> = true
const exactPagesPdfKeys: Same<keyof typeof PAGES_PDF_OPTION_KEYS, keyof PagesPdfInputOptions> = true
const exactPageImageKeys: Same<keyof typeof PAGE_IMAGE_OPTION_KEYS, keyof PageImageOptions> = true
const exactCoverImageKeys: Same<keyof typeof COVER_IMAGE_OPTION_KEYS, keyof CoverImageOptions> = true
const exactDeckPdfKeys: Same<keyof typeof DECK_PDF_OPTION_KEYS, keyof DeckPdfInputOptions> = true
const exactSlideImageKeys: Same<keyof typeof SLIDE_IMAGE_OPTION_KEYS, keyof SlideImageInputOptions> = true
const exactProofImageKeys: Same<keyof typeof PROOF_IMAGE_OPTION_KEYS, keyof ProofImageOptions> = true
const exactProtectionKeys: Same<keyof typeof PROTECTION_OPTION_KEYS, keyof Protection> = true
const exactPermissionKeys: Same<keyof typeof PERMISSION_OPTION_KEYS, keyof PdfPermissions> = true
const exactWatermarkKeys: Same<keyof typeof WATERMARK_OPTION_KEYS, keyof Watermark> = true
const exactWatermarkPositionKeys: Same<keyof typeof WATERMARK_POSITION_OPTION_KEYS, keyof NonNullable<Watermark['position']>> = true

void [
  exactBookPdfKeys,
  exactBookPlanKeys,
  exactPagePdfKeys,
  exactPagesPdfKeys,
  exactPageImageKeys,
  exactCoverImageKeys,
  exactDeckPdfKeys,
  exactSlideImageKeys,
  exactProofImageKeys,
  exactProtectionKeys,
  exactPermissionKeys,
  exactWatermarkKeys,
  exactWatermarkPositionKeys,
]

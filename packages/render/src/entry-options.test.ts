import { expect, test } from 'bun:test'
import { parseBookPlanOptions } from './book-options.ts'
import { parseCoverImageOptions, parseDeckPdfOptions, parsePageImageOptions, parseProofImageOptions, parseSlideImageOptions } from './entry-options.ts'
import { parsePagePdfOptions } from './page-render-options.ts'

test.each([
  ['bookPlan', () => parseBookPlanOptions({ extra: true } as never)],
  ['pagePdf', () => parsePagePdfOptions({ extra: true } as never)],
  ['pagesPdf', () => parsePagePdfOptions({ extra: true } as never, 'pagesPdf')],
  ['pageImage', () => parsePageImageOptions({ extra: true } as never)],
  ['coverImage', () => parseCoverImageOptions({ extra: true } as never)],
  ['deckPdf', () => parseDeckPdfOptions({ extra: true } as never)],
  ['slideImage', () => parseSlideImageOptions({ extra: true } as never)],
  ['proofImage', () => parseProofImageOptions({ extra: true } as never)],
] as const)('%s refuses an unknown option before known-option validation', (call, parse) => {
  expect(parse).toThrow(`${call} options.extra: unknown option "extra"; remove it to clear this refusal`)
})

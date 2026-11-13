import { DocumentMetadata } from '@segnavia/format'
import { parseComposedRenderOptions } from './options.ts'
import { parsePdfOptions } from './protection-options.ts'
import { PAGE_PDF_OPTION_KEYS, PAGES_PDF_OPTION_KEYS, refuseUnknownOptions } from './render-option-keys.ts'
import type { PagePdfOptions, ParsedPagePdfOptions } from './renderer.ts'
import { parseWatermarkOption } from './watermark-options.ts'

export function parsePagePdfOptions(options: PagePdfOptions, call: 'pagePdf' | 'pagesPdf' = 'pagePdf'): ParsedPagePdfOptions {
  refuseUnknownOptions(call, options, call === 'pagePdf' ? PAGE_PDF_OPTION_KEYS : PAGES_PDF_OPTION_KEYS)
  const parsed = parsePdfOptions(parseComposedRenderOptions(options), call)
  return parseWatermarkOption(
    {
      ...parsed,
      ...(parsed.metadata === undefined ? {} : { metadata: DocumentMetadata.parse(parsed.metadata) }),
    },
    call,
  )
}

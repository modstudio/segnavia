import { DocumentMetadata } from '@segnavia/format'
import { parseComposedRenderOptions } from './options.ts'
import { parsePdfOptions } from './protection-options.ts'
import { PAGE_PDF_OPTION_KEYS, PAGES_PDF_OPTION_KEYS, refuseUnknownOptions } from './render-option-keys.ts'
import type { PagePdfOptions, ParsedPagePdfOptions } from './renderer.ts'
import { parseWatermarkOption } from './watermark-options.ts'

type PagePdfCall = 'pagePdf' | 'pagesPdf'
const PAGE_PDF_OPTION_KEYS_BY_CALL = { pagePdf: PAGE_PDF_OPTION_KEYS, pagesPdf: PAGES_PDF_OPTION_KEYS } as const satisfies Record<
  PagePdfCall,
  typeof PAGE_PDF_OPTION_KEYS | typeof PAGES_PDF_OPTION_KEYS
>

export function parsePagePdfOptions(options: PagePdfOptions, call: PagePdfCall): ParsedPagePdfOptions {
  refuseUnknownOptions(call, options, PAGE_PDF_OPTION_KEYS_BY_CALL[call])
  const parsed = parsePdfOptions(parseComposedRenderOptions(options), call)
  return parseWatermarkOption(
    {
      ...parsed,
      ...(parsed.metadata === undefined ? {} : { metadata: DocumentMetadata.parse(parsed.metadata) }),
    },
    call,
  )
}

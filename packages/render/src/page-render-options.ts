import { DocumentMetadata } from '@segnavia/format'
import { parseComposedRenderOptions } from './options.ts'
import { parsePdfOptions } from './protection-options.ts'
import { refuseUnknownOptions } from './render-option-keys.ts'
import type { PagePdfOptions, ParsedPagePdfOptions } from './renderer.ts'
import { parseWatermarkOption } from './watermark-options.ts'

type PagePdfCall = 'pagePdf' | 'pagesPdf'

export function parsePagePdfOptions(options: PagePdfOptions, call: PagePdfCall): ParsedPagePdfOptions {
  refuseUnknownOptions(call, options)
  const parsed = parsePdfOptions(parseComposedRenderOptions(options), call)
  return parseWatermarkOption(
    {
      ...parsed,
      ...(parsed.metadata === undefined ? {} : { metadata: DocumentMetadata.parse(parsed.metadata) }),
    },
    call,
  )
}

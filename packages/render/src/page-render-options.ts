import { DocumentMetadata } from '@segnavia/format'
import { parseComposedRenderOptions } from './options.ts'
import { parsePdfOptions } from './protection-options.ts'
import type { PagePdfOptions, ParsedPagePdfOptions } from './renderer.ts'
import { parseWatermarkOption } from './watermark-options.ts'

export function parsePagePdfOptions(options: PagePdfOptions): ParsedPagePdfOptions {
  const parsed = parsePdfOptions(parseComposedRenderOptions(options))
  return parseWatermarkOption({
    ...parsed,
    ...(parsed.metadata === undefined ? {} : { metadata: DocumentMetadata.parse(parsed.metadata) }),
  })
}

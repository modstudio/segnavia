import { DocumentMetadata } from '@segnavia/format'
import { parseComposedRenderOptions } from './options.ts'
import { parsePdfOptions } from './protection-options.ts'
import type { PagePdfOptions, ParsedPagePdfOptions } from './renderer.ts'
import { parseWatermark } from './watermark-options.ts'

export function parsePagePdfOptions(options: PagePdfOptions): ParsedPagePdfOptions {
  const parsed = parsePdfOptions(parseComposedRenderOptions(options))
  return {
    ...parsed,
    ...(parsed.metadata === undefined ? {} : { metadata: DocumentMetadata.parse(parsed.metadata) }),
    ...(parsed.watermark === undefined ? {} : { watermark: parseWatermark(parsed.watermark) }),
  }
}

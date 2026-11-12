import { DocumentMetadata } from '@segnavia/format'
import { parseComposedRenderOptions } from './options.ts'
import { parsePdfOptions } from './protection-options.ts'
import type { PagePdfOptions, ParsedPagePdfOptions } from './renderer.ts'

export function parsePagePdfOptions(options: PagePdfOptions): ParsedPagePdfOptions {
  const parsed = parsePdfOptions(parseComposedRenderOptions(options))
  return parsed.metadata === undefined ? parsed : { ...parsed, metadata: DocumentMetadata.parse(parsed.metadata) }
}

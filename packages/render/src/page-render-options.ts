import { DocumentMetadata } from '@segnavia/format'
import { parseRenderOptions } from './options.ts'
import type { PagePdfOptions } from './renderer.ts'

export function parsePagePdfOptions(options: PagePdfOptions): PagePdfOptions {
  const parsed = parseRenderOptions(options)
  return parsed.metadata === undefined ? parsed : { ...parsed, metadata: DocumentMetadata.parse(parsed.metadata) }
}

import { DocumentMetadata } from '@segnavia/format'
import { RenderRefusedError } from './errors.ts'
import { parseComposedRenderOptions } from './options.ts'
import { parsePdfOptions } from './protection-options.ts'
import { refuseUnknownOptions } from './render-option-keys.ts'
import type { PagePdfOptions, PagesPdfOptions, ParsedPagePdfOptions, ParsedPagesPdfOptions } from './renderer.ts'
import { parseWatermarkOption } from './watermark-options.ts'

type PagePdfCall = 'pagePdf' | 'pagesPdf'

export function parsePagePdfOptions(options: PagePdfOptions, call: 'pagePdf'): ParsedPagePdfOptions
export function parsePagePdfOptions(options: PagesPdfOptions, call: 'pagesPdf'): ParsedPagesPdfOptions
export function parsePagePdfOptions(options: PagePdfOptions | PagesPdfOptions, call: PagePdfCall): ParsedPagePdfOptions | ParsedPagesPdfOptions {
  refuseUnknownOptions(call, options)
  const skipRefused = (options as PagesPdfOptions).skipRefused
  if (call === 'pagesPdf' && skipRefused !== undefined && skipRefused !== false && typeof skipRefused.report !== 'function') {
    throw new RenderRefusedError(
      'pagesPdf options.skipRefused needs a report function; pass skipRefused: { report(refused) {} }, or omit it to clear this refusal.',
    )
  }
  const normalized = call === 'pagesPdf' && skipRefused === false ? { ...options, skipRefused: undefined } : options
  const parsed = parsePdfOptions(parseComposedRenderOptions(normalized, true), call)
  return parseWatermarkOption(
    {
      ...parsed,
      ...(parsed.metadata === undefined ? {} : { metadata: DocumentMetadata.parse(parsed.metadata) }),
    },
    call,
  )
}

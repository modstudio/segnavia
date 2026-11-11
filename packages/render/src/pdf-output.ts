import { browserJpegDecoder } from './browser-jpeg.ts'
import type { TabRunner } from './browser-tab.ts'
import type { RenderOptions } from './options.ts'
import { finishPdf } from './pdf-finish.ts'
import type { RenderDeadline } from './render-deadline.ts'
import { renderReadiness } from './render-readiness.ts'

export async function finishPdfWithBrowser(
  pdf: Uint8Array,
  options: Pick<RenderOptions, 'effects' | 'limits' | 'press'>,
  withTab: TabRunner,
  deadline?: RenderDeadline,
): Promise<Uint8Array> {
  if (!options.press) return finishPdf(pdf, options)
  return withTab(
    { viewport: { width: 1, height: 1 }, scripts: true, html: '<!doctype html>', readiness: renderReadiness('refuse', false, false), deadline },
    (tab) => finishPdf(pdf, options, browserJpegDecoder(tab)),
  )
}

import { resolveDirection, resolveLimits } from '@segnavia/format'
import type { TabRunner } from './browser-tab.ts'
import { RenderLimitError } from './errors.ts'
import { fontFaces } from './font-faces.ts'
import { assetSetup } from './options.ts'
import { enforce, enforcePdfBytes } from './pdf-finish.ts'
import { loadPdf } from './pdf-load.ts'
import { receivedPageFacts } from './received-page.ts'
import type { RenderDeadline } from './render-deadline.ts'
import type { StampPdfOptions } from './renderer.ts'
import { fitWatermarkText } from './watermark-fit.ts'
import { watermarkDocument } from './watermark-markup.ts'
import { watermarkPageNumbers } from './watermark-options.ts'
import { stampReceivedWatermark } from './watermark-stamp.ts'

export async function stampReceivedPdf(bytes: Uint8Array, options: StampPdfOptions, deadline: RenderDeadline, withTab: TabRunner): Promise<Uint8Array> {
  const resolvedLimits = resolveLimits(undefined, options.limits)
  const received = await loadPdf(bytes, { source: 'received', limits: resolvedLimits })
  enforcePdfBytes(bytes, options.limits)
  if (options.limits?.sheets !== undefined && received.getPageCount() > options.limits.sheets) {
    throw new RenderLimitError('sheets', received.getPageCount(), options.limits.sheets)
  }
  if (!options.watermark) return bytes
  const pages = received.getPages()
  const selectedNumbers = new Set(watermarkPageNumbers(options.watermark, pages.length))
  const selected = pages.flatMap((page, index) => {
    const number = index + 1
    if (!selectedNumbers.has(number)) return []
    const facts = receivedPageFacts({
      mediaBox: page.getMediaBox(),
      cropBox: page.node.CropBox()?.asRectangle(),
      trimBox: page.node.TrimBox()?.asRectangle(),
      rotate: page.getRotation().angle,
      page: number,
    })
    return [{ number, facts }]
  })
  if (selected.length === 0) return bytes
  const direction = resolveDirection(options.watermark.dir, options.watermark.lang, options.watermark.text ?? '')
  const fontFamily = options.fonts?.[0]?.family ?? 'sans-serif'
  const layer = await withTab(
    {
      viewport: { width: 1024, height: 768 },
      scripts: false,
      html: watermarkDocument(
        options.watermark,
        selected.map(({ facts }) => ({
          media: facts.viewed.media,
          trim: facts.viewed.frame,
          direction,
          ...(options.watermark?.lang ? { lang: options.watermark.lang } : {}),
          fontFamily,
        })),
        fontFaces(options.fonts),
      ),
      readiness: { author: false },
      deadline,
      ...assetSetup({ ...options, limits: resolvedLimits }),
    },
    async (tab) => {
      await tab.evaluate(fitWatermarkText, undefined)
      return tab.pdf({
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      })
    },
  )
  const output = await stampReceivedWatermark(
    received,
    layer,
    selected.map(({ number, facts }, layerPage) => ({ layerPage, outputPage: number, facts })),
  )
  return enforce(output, options.limits)
}

import { hasDiagram } from '@segnavia/frame/diagrams'
import { fillPageAsOfBindings, printedPageAuthorHtml, printedPageDirection } from '@segnavia/html'
import { fontLoadSetup, type TabRunner } from './browser-tab.ts'
import { captureImage } from './capture-image.ts'
import { resolveDiagramScript } from './diagram-script.ts'
import { enforceImageBytes } from './image-bytes.ts'
import { imageWatermarkPage, injectImageWatermark, printedImageTrim, selectedImageWatermarkMarkup } from './image-watermark.ts'
import { assetSetup, type ParsedPageImageOptions } from './options.ts'
import { outputDate } from './output-date.ts'
import type { prepareRenderedPage } from './page-document.ts'
import { pageFontFacts } from './page-render.ts'
import { contentHeight, pageViewport } from './page-viewport.ts'
import type { SurfacePreflight } from './preflight.ts'
import { awaitPrintedPageComposition, renderedPageDocument } from './printed-page-render.ts'
import { proofCapturedImage, proofCaptureOptions } from './proof-image.ts'
import type { RenderDeadline } from './render-deadline.ts'
import { renderReadiness } from './render-readiness.ts'
import { filledPage } from './slot-fill.ts'
import { stampImage } from './stamp-image.ts'

export async function renderPreparedPageImage(
  prepared: Awaited<ReturnType<typeof prepareRenderedPage>>,
  opts: ParsedPageImageOptions,
  deadline: RenderDeadline,
  withTab: TabRunner,
  surfacePreflight?: SurfacePreflight,
): Promise<Uint8Array> {
  const pageWithDay = fillPageAsOfBindings(prepared.page, prepared.established.day)
  const { value: page, slots } = await filledPage(pageWithDay, prepared.established.slots, deadline.signal)
  const plainPagePreflight = page.printedPages ? undefined : surfacePreflight
  const pageHtml = printedPageAuthorHtml(page)
  const diagramScript = await resolveDiagramScript(pageHtml)
  const { grows, ...viewport } = pageViewport(page, opts.width, opts.pageWidths)
  return withTab(
    {
      viewport,
      scripts: true,
      slots,
      scale: opts.scale,
      html: renderedPageDocument(
        page,
        plainPagePreflight ? { ...prepared.options, preflight: undefined } : prepared.options,
        false,
        diagramScript,
        prepared.fontCss,
        prepared.fontFailures,
      ),
      readiness: renderReadiness(page.scripts, hasDiagram(pageHtml), opts.waitForPageReady !== false),
      boundMs: opts.boundMs,
      deadline,
      beforeOutput: opts.beforeOutput,
      progressReport: opts.progress?.report,
      ...assetSetup(opts),
      ...fontLoadSetup(prepared.fontFailures, opts.fontLoad?.report),
      preflightReport: plainPagePreflight?.capture(),
    },
    async (tab) => {
      await awaitPrintedPageComposition(tab, page, plainPagePreflight ? undefined : prepared.options.preflight)
      const captureViewport = grows ? { ...viewport, height: await contentHeight(tab) } : viewport
      plainPagePreflight?.complete()
      const fontFamily = opts.watermark ? (await pageFontFacts(tab, Boolean(page.printedPages))).fontFamily : undefined
      const watermark = selectedImageWatermarkMarkup(
        opts.watermark,
        1,
        imageWatermarkPage({
          viewport: captureViewport,
          direction: printedPageDirection(page),
          ...(page.lang ? { lang: page.lang } : {}),
          ...(fontFamily ? { fontFamily } : {}),
          ...(page.print ? { trim: printedImageTrim(page.print) } : {}),
        }),
      )
      if (watermark) await injectImageWatermark(tab, watermark, { scripts: true, origins: opts.origins })
      const image = await proofCapturedImage(tab, await captureImage(tab, proofCaptureOptions(prepared.options), false), prepared.options)
      const stamped = stampImage(image, outputDate([prepared.established.day]))
      return enforceImageBytes(stamped, opts.limits?.bytes)
    },
  )
}

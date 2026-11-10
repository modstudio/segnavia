import { hasDiagram } from '@segnavia/frame/diagrams'
import { fillPageAsOfBindings, type PreparedSlots, printedPageAuthorHtml } from '@segnavia/html'
import type { Page as Tab } from 'playwright-core'
import { type BrowserTabSetup, fontLoadSetup } from './browser-tab.ts'
import { captureImage } from './capture-image.ts'
import { resolveDiagramScript } from './diagram-script.ts'
import { assetSetup, type PageImageOptions } from './options.ts'
import type { prepareRenderedPage } from './page-document.ts'
import { contentHeight, pageViewport } from './page-viewport.ts'
import { awaitPrintedPageComposition, renderedPageDocument } from './printed-page-render.ts'
import { proofCapturedImage, proofCaptureOptions } from './proof-image.ts'
import type { RenderDeadline } from './render-deadline.ts'
import { renderReadiness } from './render-readiness.ts'
import { filledPage } from './slot-fill.ts'

export async function renderPreparedPageImage(
  prepared: Awaited<ReturnType<typeof prepareRenderedPage>>,
  opts: PageImageOptions,
  deadline: RenderDeadline,
  withTab: <T>(setup: BrowserTabSetup & { boundMs?: number; deadline?: RenderDeadline; slots?: PreparedSlots }, body: (tab: Tab) => Promise<T>) => Promise<T>,
): Promise<Uint8Array> {
  const pageWithDay = fillPageAsOfBindings(prepared.page, prepared.established.day)
  const { value: page, slots } = await filledPage(pageWithDay, prepared.established.slots, deadline.signal)
  const pageHtml = printedPageAuthorHtml(page)
  const diagramScript = await resolveDiagramScript(pageHtml)
  const { grows, ...viewport } = pageViewport(page, opts.width, opts.pageWidths)
  return withTab(
    {
      viewport,
      scripts: true,
      slots,
      scale: opts.scale,
      html: renderedPageDocument(page, prepared.options, false, diagramScript, prepared.fontCss, prepared.fontFailures),
      readiness: renderReadiness(page.scripts, hasDiagram(pageHtml), opts.waitForPageReady !== false),
      boundMs: opts.boundMs,
      deadline,
      beforeOutput: opts.beforeOutput,
      ...assetSetup(opts),
      ...fontLoadSetup(prepared.fontFailures, opts.fontLoad?.report),
    },
    async (tab) => {
      await awaitPrintedPageComposition(tab, page)
      if (grows) await contentHeight(tab)
      return proofCapturedImage(tab, await captureImage(tab, proofCaptureOptions(prepared.options), false), prepared.options)
    },
  )
}

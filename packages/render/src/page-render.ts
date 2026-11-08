import { pageDirection } from '@segnavia/format'
import { hasDiagram } from '@segnavia/frame/diagrams'
import type { HtmlPage, PreparedSlots } from '@segnavia/html'
import type { Page as Tab } from 'playwright-core'
import type { BrowserTabSetup } from './browser-tab.ts'
import { pdfWithBackdropRasters, prepareBackdropRasters, tagBackdropRasters } from './effects/raster.ts'
import { dependencySetup, type RenderOptions } from './options.ts'
import { measureOverflow, type PrintResult, printWithOverflow } from './overflow.ts'
import { containFixedPageOverflow } from './overflow-containment.ts'
import { resolvedPageDocument } from './page-document.ts'
import { assertPrintOptions, printPage } from './page-paper.ts'
import { contentHeight, pageViewport } from './page-viewport.ts'
import type { PieceGeometry } from './pages-imposition.ts'
import { awaitPrintedPageComposition, renderedPageDocument } from './printed-page-render.ts'
import type { RenderDeadline } from './render-deadline.ts'
import { renderReadiness } from './render-readiness.ts'

interface PageRenderServices {
  withTab<T>(setup: BrowserTabSetup & { boundMs?: number; deadline?: RenderDeadline; slots?: PreparedSlots }, body: (tab: Tab) => Promise<T>): Promise<T>
}

export async function renderPagePdf(
  page: HtmlPage,
  slots: PreparedSlots,
  opts: RenderOptions,
  services: PageRenderServices,
  inputIndex?: number,
  deadline?: RenderDeadline,
  diagramScript?: string,
  fontCss = '',
): Promise<PrintResult<true>> {
  if (page.print) assertPrintOptions(page.print, opts.preferCssPageSize)
  const { grows: _grows, ...viewport } = pageViewport(page, undefined, opts.pageWidths)
  return services.withTab(
    {
      viewport,
      scripts: true,
      slots,
      html: renderedPageDocument(page, opts, true, diagramScript, fontCss),
      readiness: renderReadiness(page.scripts, hasDiagram(page.html), opts.waitForPageReady !== false),
      boundMs: opts.boundMs,
      deadline,
      beforeOutput: opts.beforeOutput,
      ...dependencySetup(opts),
    },
    async (tab) => {
      await awaitPrintedPageComposition(tab, page)
      const captures = await prepareBackdropRasters(tab, opts.effects)
      if (page.print) {
        const printed = await printPage(tab, page.print, opts.preferCssPageSize, inputIndex, pageDirection(page))
        return { ...printed, bytes: await tagBackdropRasters(printed.bytes, captures) }
      }
      const fixedHeight = typeof page.size === 'object' && page.size.height !== 'auto' ? page.size.height : null
      const height = fixedHeight ?? (await contentHeight(tab))
      if (fixedHeight !== null) {
        const overflow = await measureOverflow(tab, viewport.width, 'page', inputIndex)
        return {
          bytes: await tagBackdropRasters(await tab.pdf({ width: `${viewport.width}px`, height: `${height}px`, printBackground: true }), captures),
          overflow,
        }
      }
      const printed = await printWithOverflow(
        tab,
        viewport.width,
        'page',
        { width: `${viewport.width}px`, height: `${height}px`, printBackground: true, pageRanges: '1' },
        inputIndex,
      )
      return { ...printed, bytes: await tagBackdropRasters(printed.bytes, captures) }
    },
  )
}

export function renderPiecePdf(
  page: HtmlPage,
  slots: PreparedSlots,
  geometry: PieceGeometry,
  css: string,
  opts: RenderOptions,
  services: PageRenderServices,
  deadline?: RenderDeadline,
  diagramScript?: string,
): Promise<Uint8Array> {
  const html = resolvedPageDocument(page, containFixedPageOverflow(css), { ...opts, diagramScript })
  return services.withTab(
    {
      viewport: geometry.viewport,
      scripts: true,
      slots,
      html,
      readiness: renderReadiness(page.scripts, hasDiagram(page.html), opts.waitForPageReady !== false),
      boundMs: opts.boundMs,
      deadline,
      beforeOutput: opts.beforeOutput,
      ...dependencySetup(opts),
    },
    (tab) =>
      pdfWithBackdropRasters(
        tab,
        {
          width: geometry.pdf.width,
          height: geometry.pdf.height,
          printBackground: true,
          preferCSSPageSize: false,
          pageRanges: '1',
          margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
        },
        opts.effects,
      ),
  )
}

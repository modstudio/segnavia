import type { FontFailure } from '@segnavia/format'
import type { LoadedLayoutScript } from '@segnavia/frame/layout'
import { type HtmlPage, type PreparedSlots, type PrintedHtmlPage, printedPageDirection } from '@segnavia/html'
import type { Frame, Page as Tab } from 'playwright-core'
import { fontLoadSetup, type TabRunner } from './browser-tab.ts'
import { pdfWithBackdropRasters, prepareBackdropRasters, tagBackdropRasters } from './effects/raster.ts'
import { assetSetup, type ComposedRenderOptions, type RenderOptions } from './options.ts'
import { measureOverflow, type PageFontFacts, type PrintResult, printWithOverflow } from './overflow.ts'
import { containFixedPageOverflow } from './overflow-containment.ts'
import { resolvedPageDocument } from './page-document.ts'
import { assertPrintOptions, printPage } from './page-paper.ts'
import { contentHeight, pageViewport } from './page-viewport.ts'
import type { PieceGeometry } from './pages-imposition.ts'
import { awaitPrintedPageComposition, renderedPageDocument } from './printed-page-render.ts'
import type { RenderDeadline } from './render-deadline.ts'
import { renderReadiness } from './render-readiness.ts'

interface PageRenderServices {
  withTab: TabRunner
}

export interface PageFontFactsCapture {
  printedPages?: boolean
  textRootSelector?: string
}

export async function pageFontFactsFromRoot(target: Tab | Frame, capture: PageFontFactsCapture = {}): Promise<PageFontFacts> {
  return target.evaluate(({ printedPages, textRootSelector }) => {
    const rules: string[] = []
    const collect = (list: CSSRuleList) => {
      for (const rule of list) {
        if (rule.type === CSSRule.FONT_FACE_RULE) rules.push(rule.cssText)
        else if ('cssRules' in rule) collect((rule as CSSGroupingRule).cssRules)
      }
    }
    for (const sheet of document.styleSheets) {
      try {
        collect(sheet.cssRules)
      } catch {}
    }
    const textRoot = textRootSelector
      ? document.querySelector(textRootSelector)
      : printedPages
        ? (document.querySelector('[data-segnavia-printed-page] [data-segnavia-text]') ?? document.querySelector('[data-segnavia-printed-page]'))
        : document.body
    return { fontFamily: getComputedStyle(textRoot ?? document.body).fontFamily, fontFaceCss: rules.join('') }
  }, capture)
}

export async function pageFontFacts(target: Tab | Frame, printedPages = false): Promise<PageFontFacts> {
  return pageFontFactsFromRoot(target, { printedPages })
}

export async function renderPagePdf(
  page: HtmlPage | PrintedHtmlPage,
  slots: PreparedSlots,
  opts: ComposedRenderOptions,
  services: PageRenderServices,
  inputIndex?: number,
  deadline?: RenderDeadline,
  fontCss = '',
  fontFailures: FontFailure[] = [],
  layoutScripts?: readonly LoadedLayoutScript[],
  captureFontFacts = false,
  tagged = false,
): Promise<PrintResult<true>> {
  if (page.print) assertPrintOptions(page.print, opts.preferCssPageSize)
  const { grows: _grows, ...viewport } = pageViewport(page, undefined, opts.pageWidths)
  return services.withTab(
    {
      viewport,
      scripts: true,
      slots,
      html: renderedPageDocument(page, opts, true, fontCss, fontFailures, layoutScripts),
      readiness: renderReadiness(page.scripts, opts.waitForPageReady !== false, (layoutScripts?.length ?? 0) > 0),
      boundMs: opts.boundMs,
      deadline,
      beforeOutput: opts.beforeOutput,
      progressReport: opts.progress?.report,
      ...assetSetup(opts),
      ...fontLoadSetup(fontFailures, opts.fontLoad?.report),
    },
    async (tab) => {
      await awaitPrintedPageComposition(tab, page, opts.preflight)
      const captures = await prepareBackdropRasters(tab, opts.effects)
      const font = captureFontFacts ? await pageFontFacts(tab, Boolean(page.printedPages)) : {}
      if (page.print) {
        const printed = await printPage(tab, page.print, opts.preferCssPageSize, inputIndex, printedPageDirection(page), tagged)
        return { ...printed, ...font, bytes: await tagBackdropRasters(printed.bytes, captures) }
      }
      const fixedHeight = typeof page.size === 'object' && page.size.height !== 'auto' ? page.size.height : null
      const height = fixedHeight ?? (await contentHeight(tab))
      if (fixedHeight !== null) {
        const overflow = await measureOverflow(tab, viewport.width, 'page', inputIndex)
        return {
          bytes: await tagBackdropRasters(await tab.pdf({ width: `${viewport.width}px`, height: `${height}px`, printBackground: true, tagged }), captures),
          ...font,
          overflow,
        }
      }
      const printed = await printWithOverflow(
        tab,
        viewport.width,
        'page',
        { width: `${viewport.width}px`, height: `${height}px`, printBackground: true, pageRanges: '1', tagged },
        inputIndex,
      )
      return { ...printed, ...font, bytes: await tagBackdropRasters(printed.bytes, captures) }
    },
  )
}

export async function renderPiecePdf(
  page: HtmlPage,
  slots: PreparedSlots,
  geometry: PieceGeometry,
  css: string,
  opts: RenderOptions,
  services: PageRenderServices,
  deadline?: RenderDeadline,
  layoutScripts?: readonly LoadedLayoutScript[],
  captureFontFacts = false,
  tagged = false,
): Promise<PrintResult> {
  const html = resolvedPageDocument(page, containFixedPageOverflow(css), { ...opts, layoutScripts })
  return services.withTab(
    {
      viewport: geometry.viewport,
      scripts: true,
      slots,
      html,
      readiness: renderReadiness(page.scripts, opts.waitForPageReady !== false, (layoutScripts?.length ?? 0) > 0),
      boundMs: opts.boundMs,
      deadline,
      beforeOutput: opts.beforeOutput,
      ...assetSetup(opts),
    },
    async (tab) => ({
      bytes: await pdfWithBackdropRasters(
        tab,
        {
          width: geometry.pdf.width,
          height: geometry.pdf.height,
          printBackground: true,
          tagged,
          preferCSSPageSize: false,
          pageRanges: '1',
          margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
        },
        opts.effects,
      ),
      ...(captureFontFacts ? await pageFontFacts(tab) : {}),
    }),
  )
}

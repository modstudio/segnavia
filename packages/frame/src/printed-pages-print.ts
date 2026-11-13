import { type Imposition, impose, isPrintedPageIdentityImposition, mixedImpositionGeometryRefusal, paperViewport, sheetMm } from '@segnavia/format'
import { type HtmlPage, printedPageAuthorHtml, resolvePrintedPageHtml } from '@segnavia/html'
import { frameSandbox, newNonce } from './bridge.ts'
import { layoutsForHtml } from './layout.ts'
import { imposedPaperDocument, type PrintablePagesOptions, type PrintablePaperBody, printablePaper } from './print-document.ts'
import { measurePrintedPageCount } from './printed-page-count.ts'
import { printedPageValueDocument } from './printed-page-document.ts'
import { escapeHtml } from './svg.ts'

function composedFrame(page: HtmlPage, index: number, expectedCount: number, options: PrintablePagesOptions): string {
  const viewport = paperViewport(page.print as NonNullable<HtmlPage['print']>)
  const resolved = resolvePrintedPageHtml(page)
  const srcdoc = printedPageValueDocument(resolved, {
    nonce: options.nonce ?? newNonce(),
    css: options.css,
    only: index,
    expectedCount,
    printBackground: true,
    layoutScripts: layoutsForHtml(printedPageAuthorHtml(resolved), options.layoutScripts ?? []),
    limits: options.limits,
    origins: options.origins,
  })
  return `<iframe sandbox="${frameSandbox('refuse')}" srcdoc="${escapeHtml(srcdoc)}" style="width:${viewport.width}px;height:${viewport.height}px;border:0;display:block"></iframe>`
}

export async function printedPagesPrintDocument(
  pages: HtmlPage[],
  imposition: Imposition,
  options: PrintablePagesOptions & { deadlineAt: number },
): Promise<{ html: string; paper: { width: number; height: number }; sheets: number }> {
  const geometryRefusal = mixedImpositionGeometryRefusal(pages)
  if (geometryRefusal) throw new RangeError(geometryRefusal)
  const printed = pages.filter((page) => page.printedPages)
  for (const page of printed) {
    if (!page.print || !isPrintedPageIdentityImposition(page.print, imposition)) {
      throw new RangeError(
        'Printed pages could not establish one unchanged page per paper under this imposition; print without imposition to clear this refusal.',
      )
    }
  }
  const counts = new Map<HtmlPage, number>()
  for (const page of printed) {
    counts.set(
      page,
      await measurePrintedPageCount(
        page,
        {
          nonce: options.nonce,
          css: options.css,
          layoutScripts: options.layoutScripts,
          limits: options.limits,
          origins: options.origins,
        },
        options.deadlineAt,
      ),
    )
  }
  const paper = sheetMm(imposition)
  const bodies: PrintablePaperBody[] = pages.flatMap((page) => {
    if (page.printedPages) {
      const count = counts.get(page) ?? 0
      return Array.from({ length: count }, (_, index) => ({ body: composedFrame(page, index + 1, count, options), side: 'front' as const }))
    }
    const imposed = impose(imposition, 1)
    return [{ body: printablePaper([page], imposition, imposed, 0, options), side: 'front' as const }]
  })
  return { html: imposedPaperDocument(paper, ' dir="ltr"', bodies), paper, sheets: bodies.length }
}

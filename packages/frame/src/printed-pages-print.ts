import { type Imposition, impose, isPrintedPageIdentityImposition, limitRefusal, PX_PER_MM, paperViewport, resolveLimits, sheetMm } from '@segnavia/format'
import type { HtmlPage } from '@segnavia/html'
import { frameSandbox, MESSAGE, messageFrom, newNonce } from './bridge.ts'
import { imposedPaperDocument, type PrintablePagesOptions, type PrintablePaperBody, printablePaper } from './print-document.ts'
import { printedPageDocument } from './printed-page-document.ts'
import { escapeHtml } from './svg.ts'

export const PRINTED_PAGE_COUNT_REFUSAL =
  'The browser could not establish the composed page count because parent-page geometry or content composition failed, or page resources did not settle; correct the parent-page geometry or content failure, or wait for its resources, to clear this refusal.'

function composedFrame(page: HtmlPage, index: number, expectedCount: number, options: PrintablePagesOptions): string {
  const viewport = paperViewport(page.print as NonNullable<HtmlPage['print']>)
  const srcdoc = printedPageDocument(page, {
    nonce: options.nonce ?? newNonce(),
    css: options.css,
    only: index,
    expectedCount,
    printBackground: true,
    diagramScript: options.diagramScript,
    limits: options.limits,
  })
  return `<iframe sandbox="${frameSandbox('refuse')}" srcdoc="${escapeHtml(srcdoc)}" style="width:${viewport.width}px;height:${viewport.height}px;border:0;display:block"></iframe>`
}

function measurePrintedPage(page: HtmlPage, options: PrintablePagesOptions, deadlineAt: number): Promise<number> {
  const paper = sheetMm(page.print as NonNullable<HtmlPage['print']>)
  const viewport = paperViewport(page.print as NonNullable<HtmlPage['print']>)
  const frame = document.createElement('iframe')
  frame.setAttribute('sandbox', frameSandbox('refuse'))
  frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${viewport.width}px;height:${viewport.height}px;border:0;opacity:0;pointer-events:none`
  const srcdoc = printedPageDocument(page, {
    nonce: options.nonce ?? newNonce(),
    css: options.css,
    measure: true,
    diagramScript: options.diagramScript,
    limits: options.limits,
  })
  return new Promise((resolve, reject) => {
    let timer = 0
    const finish = (result: number | Error) => {
      window.removeEventListener('message', onMessage)
      window.clearTimeout(timer)
      frame.remove()
      result instanceof Error ? reject(result) : resolve(result)
    }
    const onMessage = (event: MessageEvent) => {
      const message = messageFrom(event, frame)
      if (message?.type !== MESSAGE.height || message.height === undefined || message.height < (paper.height * PX_PER_MM) / 2) return
      const count = Math.round(message.height / (paper.height * PX_PER_MM))
      const limits = resolveLimits(page.limits, options.limits)
      if (count > limits.pages) {
        finish(new RangeError(limitRefusal('pages', count, limits.pages, { pagesSource: limits.pagesSource })))
        return
      }
      finish(count)
    }
    window.addEventListener('message', onMessage)
    timer = window.setTimeout(() => finish(new Error(PRINTED_PAGE_COUNT_REFUSAL)), Math.max(0, deadlineAt - Date.now()))
    frame.srcdoc = srcdoc
    document.body.append(frame)
  })
}

export async function printedPagesPrintDocument(
  pages: HtmlPage[],
  imposition: Imposition,
  options: PrintablePagesOptions & { deadlineAt: number },
): Promise<{ html: string; paper: { width: number; height: number }; sheets: number }> {
  const printed = pages.filter((page) => page.printedPages)
  for (const page of printed) {
    if (!page.print || !isPrintedPageIdentityImposition(page.print, imposition)) {
      throw new RangeError(
        'Printed pages could not establish one unchanged page per paper under this imposition; print without imposition to clear this refusal.',
      )
    }
  }
  const counts = new Map<HtmlPage, number>()
  for (const page of printed) counts.set(page, await measurePrintedPage(page, options, options.deadlineAt))
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

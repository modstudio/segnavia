import { type Imposition, isPrintedPageIdentityImposition, type Page, PRINTED_PAGE_LIMIT, PX_PER_MM, resolveDirection, sheetMm } from '@segnavia/format'
import { MESSAGE, messageFrom, newNonce } from './bridge.ts'
import type { PrintablePagesOptions } from './print-document.ts'
import { printablePagesDocument } from './print-document.ts'
import { printedPageDocument } from './printed-page-document.ts'
import { escapeHtml } from './svg.ts'

export const PRINTED_PAGE_COUNT_REFUSAL =
  'The browser could not establish the composed page count; wait for the page resources or shorten the content to clear this refusal.'

const bodyOf = (html: string) => html.match(/<body>([\s\S]*)<\/body>/i)?.[1] ?? ''

function composedFrame(page: Page, index: number, options: PrintablePagesOptions): string {
  const paper = sheetMm(page.print as NonNullable<Page['print']>)
  const offset = resolveDirection(page.dir, page.lang, page.html) === 'rtl' ? `margin-left:-${paper.width}mm;` : ''
  const srcdoc = printedPageDocument(page, { nonce: options.nonce ?? newNonce(), css: options.css, only: index })
  return `<section class="paper"><iframe sandbox="allow-scripts" srcdoc="${escapeHtml(srcdoc)}" style="${offset}width:${paper.width * 2}mm;height:${paper.height}mm;border:0;display:block"></iframe></section>`
}

function measurePrintedPage(page: Page, options: PrintablePagesOptions, deadlineMs: number): Promise<number> {
  const paper = sheetMm(page.print as NonNullable<Page['print']>)
  const frame = document.createElement('iframe')
  frame.setAttribute('sandbox', 'allow-scripts')
  frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${paper.width * PX_PER_MM * 2}px;height:${paper.height * PX_PER_MM}px;border:0;opacity:0;pointer-events:none`
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
      if (count > PRINTED_PAGE_LIMIT) {
        finish(new RangeError(`The composed page count is ${count}, above the limit ${PRINTED_PAGE_LIMIT}; shorten the content to clear this refusal.`))
        return
      }
      finish(count)
    }
    window.addEventListener('message', onMessage)
    timer = window.setTimeout(() => finish(new Error(PRINTED_PAGE_COUNT_REFUSAL)), deadlineMs)
    frame.srcdoc = printedPageDocument(page, { nonce: options.nonce ?? newNonce(), css: options.css, measure: true })
    document.body.append(frame)
  })
}

export async function printedPagesPrintDocument(
  pages: Page[],
  imposition: Imposition,
  options: PrintablePagesOptions & { deadlineMs: number },
): Promise<{ html: string; paper: { width: number; height: number } }> {
  const printed = pages.filter((page) => page.printedPages)
  for (const page of printed) {
    if (!page.print || !isPrintedPageIdentityImposition(page.print, imposition)) {
      throw new RangeError(
        'Printed pages could not establish one unchanged page per paper under this imposition; print without imposition to clear this refusal.',
      )
    }
  }
  const counts = new Map<Page, number>()
  for (const page of printed) counts.set(page, await measurePrintedPage(page, options, options.deadlineMs))
  const paper = sheetMm(imposition)
  const papers = pages.flatMap((page) => {
    if (page.printedPages) {
      return Array.from({ length: counts.get(page) ?? 0 }, (_, index) => composedFrame(page, index + 1, options))
    }
    return [bodyOf(printablePagesDocument([page], imposition, options).html)]
  })
  const css = `@page{size:${paper.width}mm ${paper.height}mm;margin:0}html,body{margin:0}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}.paper{width:${paper.width}mm;height:${paper.height}mm;position:relative;overflow:hidden;break-after:page}`
  return { html: `<!doctype html><html dir="ltr"><head><meta charset="utf-8"><style>${css}</style></head><body>${papers.join('')}</body></html>`, paper }
}

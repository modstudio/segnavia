import { type FontFailure, LimitExceededError, type PreflightEntry, type PreflightProfile, PX_PER_MM, paperViewport, resolveLimits, sheetMm } from '@segnavia/format'
import { type HtmlPage, printedPageAuthorHtml, resolvePrintedPageHtml } from '@segnavia/html'
import { frameSandbox, MESSAGE, messageFrom, newNonce } from './bridge.ts'
import { layoutsForHtml } from './layout.ts'
import type { PrintablePagesOptions } from './print-document.ts'
import { printedPageValueDocument } from './printed-page-document.ts'

export const PRINTED_PAGE_COUNT_REFUSAL =
  'The browser could not establish the composed page count because parent-page geometry or content composition failed, or page resources did not settle; correct the parent-page geometry or content failure, or wait for its resources, to clear this refusal.'

export interface PrintedPageCountOptions extends PrintablePagesOptions {
  fontFailures?: FontFailure[]
  preflightSeed?: PreflightEntry[]
  profile?: PreflightProfile
  report?: (report: NonNullable<ReturnType<typeof messageFrom>>['report']) => void
}

export function measurePrintedPageCount(page: HtmlPage, options: PrintedPageCountOptions, deadlineAt: number): Promise<number> {
  const paper = sheetMm(page.print as NonNullable<HtmlPage['print']>)
  const viewport = paperViewport(page.print as NonNullable<HtmlPage['print']>)
  const frame = document.createElement('iframe')
  frame.setAttribute('sandbox', frameSandbox('refuse'))
  frame.style.cssText = `position:fixed;inset-inline-start:-20000px;inset-block-start:0;inline-size:${viewport.width}px;block-size:${viewport.height}px;border:0;opacity:0;pointer-events:none`
  const resolved = resolvePrintedPageHtml(page)
  const srcdoc = printedPageValueDocument(resolved, {
    nonce: options.nonce ?? newNonce(),
    baseCss: options.baseCss,
    css: options.css,
    csp: options.cspExtra,
    measure: true,
    layoutScripts: layoutsForHtml(printedPageAuthorHtml(resolved), options.layoutScripts ?? []),
    limits: options.limits,
    origins: options.origins,
    fontFailures: options.fontFailures,
    profile: options.profile,
    preflightSeed: options.preflightSeed,
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
      const message = messageFrom(event, frame, options.profile)
      if (message?.type === MESSAGE.preflight && message.report) options.report?.(message.report)
      if (message?.type === MESSAGE.composeFailure && message.text) return finish(new Error(message.text))
      if (message?.type !== MESSAGE.height || message.height === undefined || message.height < (paper.height * PX_PER_MM) / 2) return
      const count = Math.round(message.height / (paper.height * PX_PER_MM))
      const limits = resolveLimits(page.limits, options.limits)
      if (count > limits.pages) return finish(new LimitExceededError('pages', count, limits.pages, { pagesSource: limits.pagesSource }))
      finish(count)
    }
    window.addEventListener('message', onMessage)
    timer = window.setTimeout(() => finish(new Error(PRINTED_PAGE_COUNT_REFUSAL)), Math.max(0, deadlineAt - Date.now()))
    frame.srcdoc = srcdoc
    document.body.append(frame)
  })
}

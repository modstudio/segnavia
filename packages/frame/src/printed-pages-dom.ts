import type { OriginApproval, PreflightProfile } from '@segnavia/format'
import { frameSandbox, newNonce } from './bridge.ts'
import { dispatchElementError } from './element-error.ts'
import { printedPageValueDocument } from './printed-page-document.ts'
import type { PrintedPagesLayout } from './printed-pages.ts'
import type { PreparedPrintedPages } from './printed-pages-load.ts'
import {
  type PaperExtent,
  type PrintedPagesFit,
  type PrintedSpread,
  printedPageSpreads,
  printedPagesScale,
  shouldReusePrintedPageSrcdoc,
} from './printed-pages-policy.ts'

export interface PrintedPaperState {
  page: number
  slot: HTMLElement
  shown?: HTMLIFrameElement
  pending?: HTMLIFrameElement
  srcdoc?: string
  nonce?: string
}

export function renderPrintedPagesFailure(host: HTMLElement, reason?: unknown): void {
  const existing = host.querySelector<HTMLElement>('[part="failure"]')
  if (reason === undefined) {
    host.removeAttribute('failure')
    existing?.remove()
    return
  }
  const error = reason instanceof Error ? reason : new Error(String(reason))
  host.setAttribute('failure', '')
  const part = existing ?? document.createElement('div')
  part.setAttribute('part', 'failure')
  part.setAttribute('role', 'alert')
  part.dir = 'auto'
  part.textContent = error.message
  if (!existing) host.append(part)
  dispatchElementError(host, error)
}

export function buildPrintedPagesDom(
  host: HTMLElement,
  count: number,
  direction: 'ltr' | 'rtl',
  viewport: { width: number; height: number },
  layout: PrintedPagesLayout,
): Map<number, PrintedPaperState> {
  const papers = new Map<number, PrintedPaperState>()
  host.replaceChildren()
  host.dir = direction
  const spreads: PrintedSpread[] =
    layout === 'facing' ? printedPageSpreads(count, direction) : Array.from({ length: count }, (_, index) => ({ inlineStart: index + 1 }))
  for (const spread of spreads) {
    const outer = document.createElement('div')
    outer.className = 'segnavia-printed-pages__spread'
    const inner = document.createElement('div')
    inner.className = 'segnavia-printed-pages__spread-content'
    for (const page of [spread.inlineStart, spread.inlineEnd]) {
      const slot = document.createElement('div')
      slot.className = 'segnavia-printed-pages__paper'
      slot.style.inlineSize = `${viewport.width}px`
      slot.style.blockSize = `${viewport.height}px`
      if (page) {
        slot.dataset.page = String(page)
        papers.set(page, { page, slot })
      }
      inner.append(slot)
    }
    inner.style.inlineSize = `${viewport.width * (layout === 'facing' ? 2 : 1)}px`
    inner.style.blockSize = `${viewport.height}px`
    outer.append(inner)
    host.append(outer)
  }
  return papers
}

export function printedPaperExtents(host: HTMLElement, papers: Iterable<PrintedPaperState>): PaperExtent[] {
  const top = host.getBoundingClientRect().top
  return [...papers].map(({ page, slot }) => ({
    page,
    start: slot.getBoundingClientRect().top - top + host.scrollTop,
    end: slot.getBoundingClientRect().bottom - top + host.scrollTop,
  }))
}

export function refitPrintedPagesDom(host: HTMLElement, fit: PrintedPagesFit, zoom: number): void {
  for (const outer of host.querySelectorAll<HTMLElement>('.segnavia-printed-pages__spread')) {
    const inner = outer.firstElementChild as HTMLElement
    const scale = printedPagesScale(fit, { inline: inner.offsetWidth, block: inner.offsetHeight }, { inline: host.clientWidth, block: host.clientHeight }, zoom)
    inner.style.transform = `scale(${scale})`
    outer.style.inlineSize = `${inner.offsetWidth * scale}px`
    outer.style.blockSize = `${inner.offsetHeight * scale}px`
  }
}

export function scrollToPrintedPaper(host: HTMLElement, papers: Map<number, PrintedPaperState>, page: number): number | undefined {
  const spread = papers.get(page)?.slot.parentElement?.parentElement
  if (!spread) return undefined
  host.scrollTo({ top: spread.offsetTop })
  return spread.offsetTop
}

export function composePrintedPaper(
  state: PrintedPaperState,
  prepared: PreparedPrintedPages,
  index: number,
  generation: number,
  options: { css: string; csp?: string; origins: Iterable<OriginApproval>; profile: PreflightProfile },
): void {
  if (state.pending) return
  const build = (nonce: string) =>
    printedPageValueDocument(prepared.page, {
      nonce,
      baseCss: prepared.fontCss,
      css: options.css,
      csp: options.csp,
      origins: options.origins,
      only: index,
      expectedCount: prepared.count,
      layoutScripts: prepared.layouts,
      fontFailures: prepared.fontFailures,
      profile: options.profile,
      preflightSeed: prepared.preflightSeed,
      screen: { spread: false },
    })
  const candidateNonce = state.nonce ?? newNonce()
  const candidate = build(candidateNonce)
  if (shouldReusePrintedPageSrcdoc(state.srcdoc, candidate)) {
    if (state.shown) state.shown.dataset.generation = String(generation)
    return
  }
  state.nonce = state.srcdoc === undefined ? candidateNonce : newNonce()
  const frame = document.createElement('iframe')
  frame.setAttribute('sandbox', frameSandbox('refuse'))
  frame.title = `Page ${index}`
  frame.dataset.generation = String(generation)
  frame.style.visibility = 'hidden'
  frame.srcdoc = state.nonce === candidateNonce ? candidate : build(state.nonce)
  state.pending = frame
  state.slot.append(frame)
}

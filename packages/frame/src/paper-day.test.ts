import { expect, test } from 'bun:test'
import type { HtmlPage } from '@segnavia/html'
import { preparePaperDays } from './paper-day.ts'

interface PaperHarness {
  days: string[]
  dispatchEvent(event: Event): boolean
  errors: unknown[]
  pages: HtmlPage[]
  paints: number
  placeholders: number
  paint(): void
}

async function paperHarness(pages: HtmlPage[]): Promise<PaperHarness> {
  if (!globalThis.HTMLElement) Object.assign(globalThis, { HTMLElement: class extends EventTarget {} })
  if (!globalThis.ResizeObserver)
    Object.assign(globalThis, {
      ResizeObserver: class {
        disconnect() {}
        observe() {}
      },
    })
  const { SegnaviaPaper } = await import('./paper.ts')
  const paper: PaperHarness & Record<string, unknown> = {
    errors: [],
    days: [],
    isConnected: true,
    pages,
    imposition: {},
    imposed: {},
    slotGeneration: 0,
    slotPreparation: undefined,
    resolvedSlots: undefined,
    resolvedGeneration: 0,
    paints: 0,
    placeholders: 0,
    cancelSlotPreparation: (SegnaviaPaper.prototype as unknown as { cancelSlotPreparation(): void }).cancelSlotPreparation,
    paintPlaceholder() {
      paper.placeholders++
    },
    paintResolved() {
      paper.paints++
    },
    dispatchEvent(event: Event) {
      if (event.type === 'asof') paper.days.push((event as CustomEvent<{ date: string }>).detail.date)
      if (event.type === 'error') paper.errors.push((event as ErrorEvent).error)
      return true
    },
    paint: (SegnaviaPaper.prototype as unknown as { paint(): void }).paint,
  }
  Object.setPrototypeOf(paper, SegnaviaPaper.prototype)
  return paper
}

function datedPage(html = '<main>Page</main>'): HtmlPage {
  return {
    html,
    size: { width: 'full', height: 'auto' },
    scripts: 'refuse',
    asOf: { kind: 'fixed', date: '2026-11-14' },
  }
}

test('paper refuses distinct page days when slots.resolve must supply one rendering', async () => {
  const pages: HtmlPage[] = [
    { html: '<main>One</main>', size: { width: 'full', height: 'auto' }, scripts: 'refuse', asOf: { kind: 'fixed', date: '2026-11-14' } },
    { html: '<main>Two</main>', size: { width: 'full', height: 'auto' }, scripts: 'refuse', asOf: { kind: 'fixed', date: '2026-11-15' } },
  ]
  const promise = preparePaperDays(
    pages,
    { moment: Date.parse('2026-11-14T12:00:00Z') },
    { slots: { resolve: async () => undefined }, signal: new AbortController().signal },
  )
  await expect(promise).rejects.toThrow('2026-11-14')
  await expect(promise).rejects.toThrow('2026-11-15')
})

test('paper dispatches its established day', async () => {
  const paper = await paperHarness([datedPage()])
  paper.paint()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(paper.days).toEqual(['2026-11-14'])
})

test('paper dispatches its day before a later font refusal', async () => {
  const page = datedPage()
  page.style = { fonts: { body: { faces: [{}] } } }
  const paper = await paperHarness([page])
  paper.paint()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(paper.days).toEqual(['2026-11-14'])
  expect(paper.errors).toHaveLength(1)
})

test('paper keeps its placeholder when a page motif has no source', async () => {
  const paper = await paperHarness([datedPage('<span data-motif="segnavia:folio"></span>')])
  paper.paint()
  expect(paper.placeholders).toBe(1)
  expect(paper.paints).toBe(0)
  expect(paper.errors).toHaveLength(1)
})

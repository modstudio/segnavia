import { expect, test } from 'bun:test'
import { Imposition, impositionMarks, Page, sharedImpositionPress } from '@segnavia/format'
import { resolvePageHtml } from '@segnavia/html'

class TestElement extends EventTarget {}
Object.assign(globalThis, {
  HTMLElement: TestElement,
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
  window: { addEventListener() {}, removeEventListener() {} },
})

const { SegnaviaPaper } = await import('./paper.ts')

const imposition = (changes: Record<string, unknown> = {}) =>
  Imposition.parse({
    paper: { width: 40, height: 40, unit: 'mm' },
    columns: 1,
    rows: 1,
    cell: { width: 20, height: 20 },
    margin: { top: 2, right: 10, bottom: 8, left: 10 },
    marks: true,
    ...changes,
  })

function paperHarness() {
  const paper = new SegnaviaPaper() as InstanceType<typeof SegnaviaPaper> & Record<string, unknown>
  Object.assign(paper, {
    imposed: null,
    paperIndex: 0,
    shownSide: 'front',
    pages: [],
    brandDocuments: [],
    brandGeneration: 0,
    reflectState() {},
    paint() {},
  })
  return paper
}

const loadValues = (SegnaviaPaper.prototype as unknown as { loadValues(pages: unknown[], imposition: Imposition): void }).loadValues

test('paper placement uses the pieces shared bleed', () => {
  const paper = paperHarness()
  const page = resolvePageHtml(Page.parse({ html: 'page', print: { paper: { width: 20, height: 20, unit: 'mm' }, bleed: 3 } }))
  loadValues.call(paper, [page], imposition())
  const imposed = (paper as unknown as { imposed: ReturnType<typeof import('@segnavia/format').impose> }).imposed
  expect(imposed.placements[0]?.bleedBox).toMatchObject({ x: 7, y: 0, width: 26, height: 25 })
})

test('paper refuses pieces whose press geometry disagrees', () => {
  const paper = paperHarness()
  const pages = [2, 3].map((bleed) => resolvePageHtml(Page.parse({ html: 'page', print: { paper: { width: 20, height: 20, unit: 'mm' }, bleed } })))
  expect(() => loadValues.call(paper, pages, imposition())).toThrow(
    'piece 2 has print.bleed 3mm but piece 1 has 2mm; pieces on one imposition share one bleed and one safe',
  )
})

test('paper reports every omitted mark in the same event payload as PDF rendering', () => {
  const paper = paperHarness()
  const reports: unknown[] = []
  const pages = [resolvePageHtml(Page.parse({ html: 'page' }))]
  const imposed = imposition({ sides: 'two' })
  const press = sharedImpositionPress(pages)
  paper.addEventListener('marksomitted', (event: Event) => reports.push((event as CustomEvent).detail))
  loadValues.call(paper, pages, imposed)
  expect(reports).toEqual([{ omittedMarks: impositionMarks(imposed, press).flatMap((side) => side.omittedMarks) }])
})

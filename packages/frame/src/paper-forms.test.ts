import { expect, test } from 'bun:test'
import { Imposition, impose, Page } from '@segnavia/format'
import { resolvePageHtml } from '@segnavia/html'
import type { FormsOption } from './bridge.ts'
import { paperBoxSize } from './paper-geometry.ts'

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

test('setting paper form refusal after paint repaints its page frame', () => {
  const imposition = Imposition.parse({
    paper: { width: 8.5, height: 11, unit: 'in' },
    columns: 1,
    rows: 1,
    cell: { width: 215.9, height: 279.4 },
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    gap: { column: 0, row: 0 },
  })
  const page = Page.parse({ html: '<form></form>', scripts: 'sandboxed', print: { paper: 'letter' } })
  const imposed = impose(imposition, 1, page.print)
  let box: { innerHTML: string; style: Record<string, string>; className: string; dir: string } | undefined
  Object.assign(globalThis, {
    document: {
      createElement() {
        return { innerHTML: '', style: {}, className: '', dir: '' }
      },
    },
  })
  const paper = Object.create(SegnaviaPaper.prototype) as {
    forms: FormsOption | undefined
    paint(): void
  }
  Object.assign(paper, {
    clientWidth: paperBoxSize(imposed.paper).width,
    imposition,
    imposed,
    pages: [resolvePageHtml(page)],
    paperIndex: 0,
    shownSide: 'front',
    resolvedFontCss: '',
    resolvedSlots: undefined,
    origins: [],
    style: { setProperty() {} },
    replaceChildren(value: typeof box) {
      box = value
    },
    querySelector() {
      return box
    },
  })
  const paintResolved = (SegnaviaPaper.prototype as unknown as { paintResolved(...args: unknown[]): void }).paintResolved
  paper.paint = () => paintResolved.call(paper, imposition, imposed, [resolvePageHtml(page)])

  paper.paint()
  expect(box?.innerHTML).toContain('sandbox="allow-scripts allow-forms"')
  paper.forms = 'refuse'
  expect(box?.innerHTML).toContain('sandbox="allow-scripts"')
  expect(box?.innerHTML).not.toContain('allow-forms')
})

import { expect, test } from 'bun:test'
import { Page, Print } from '@segnavia/format'
import { resolvePageHtml } from '@segnavia/html'
import { type FormsOption, frameSandbox } from './bridge.ts'
import { internalPageDayLoad } from './document-value-load.ts'

class TestElement extends EventTarget {}
class TestPage extends EventTarget {
  part = { add() {} }
  sandbox = ''
  declare forms: FormsOption | undefined;
  [internalPageDayLoad](page: Page) {
    this.sandbox = frameSandbox(page.scripts, this.forms)
  }
}
Object.assign(globalThis, {
  HTMLElement: TestElement,
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
  window: { addEventListener() {}, removeEventListener() {} },
  customElements: { get() {}, define() {} },
  document: { createElement: () => new TestPage() },
})

const { SegnaviaDocument } = await import('./document.ts')

test('document form refusal reaches a mounted page frame', () => {
  const page = Page.parse({ html: '<form></form>', scripts: 'sandboxed', print: { paper: 'letter' } })
  let mounted: TestPage | undefined
  const sheet = {
    dataset: { page: '0' },
    get firstElementChild() {
      return mounted ?? null
    },
    append(element: TestPage) {
      mounted = element
    },
  }
  const viewer = Object.create(SegnaviaDocument.prototype) as {
    forms: FormsOption | undefined
    paint(): void
  }
  Object.assign(viewer, {
    pageValues: [resolvePageHtml(page)],
    pageDayContexts: [{ day: undefined, slots: {} }],
    printValue: Print.parse({ paper: 'letter' }),
    origins: [],
    paint() {
      mounted = undefined
      ;(SegnaviaDocument.prototype as unknown as { mount(sheet: HTMLElement): void }).mount.call(viewer, sheet as unknown as HTMLElement)
    },
  })

  viewer.paint()
  expect(mounted?.sandbox).toBe('allow-scripts allow-forms')
  viewer.forms = 'refuse'
  expect(mounted?.sandbox).toBe('allow-scripts')
})

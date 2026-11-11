import { expect, test } from 'bun:test'
import { Page, type SlotsOptions } from '@segnavia/format'
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

const { SegnaviaDocument } = await import('./document.ts')

test('document paints its sheets immediately, then resolves and reports one shared day for three equal pages', async () => {
  let anchorCalls = 0
  let slotCalls = 0
  let paints = 0
  const events: unknown[] = []
  const pages = Array.from({ length: 3 }, (_, index) => Page.parse({ id: String(index), html: '<p>Page</p>', asOf: { kind: 'anchor', anchor: 'week' } }))
  const documentViewer = {
    isConnected: true,
    sourceValues: pages,
    pageValues: pages.map(resolvePageHtml),
    printValue: {},
    slotOptions: {
      resolve: async () => {
        slotCalls++
        return { id: 'week', values: {} }
      },
    } as SlotsOptions,
    slotGeneration: 0,
    slotPreparation: undefined,
    filledHtml: undefined,
    resolvedSlots: undefined,
    resolvedGeneration: 0,
    pageDayContexts: [],
    observer: null,
    pageObserver: null,
    style: { removeProperty() {} },
    replaceChildren() {},
    cancelSlotPreparation: (SegnaviaDocument.prototype as unknown as { cancelSlotPreparation(): void }).cancelSlotPreparation,
    paintResolved() {
      paints++
    },
    asOfInputsChanged() {},
    dispatchEvent(event: Event) {
      if (event.type === 'asof') events.push((event as CustomEvent).detail)
      return true
    },
    paint: (SegnaviaDocument.prototype as unknown as { paint(): void }).paint,
  }

  const asOfPrototype = Object.getPrototypeOf(SegnaviaDocument.prototype)
  Object.getOwnPropertyDescriptor(asOfPrototype, 'anchors')?.set?.call(documentViewer, {
    choices: [{ name: 'week', label: 'Week' }],
    resolve: async () => {
      anchorCalls++
      return '2026-11-09'
    },
  })
  Object.getOwnPropertyDescriptor(asOfPrototype, 'moment')?.set?.call(documentViewer, Date.parse('2026-11-14T12:00:00Z'))

  documentViewer.paint()
  expect(paints).toBe(1)
  await new Promise((resolve) => setTimeout(resolve, 0))

  expect(anchorCalls).toBe(1)
  expect(slotCalls).toBe(1)
  expect(events).toEqual([{ date: '2026-11-09', zone: 'UTC', kind: 'anchor', anchor: 'week', moment: Date.parse('2026-11-14T12:00:00Z') }])
  expect(paints).toBe(2)
})

test('a document collection pass writes the page day before applying host slots', async () => {
  const source = Page.parse({
    html: '<p data-slot-value="name">Name</p><time data-slot-value="asOf.date">placeholder</time>',
    asOf: { kind: 'fixed', date: '2026-11-14' },
    slots: [{ key: 'name', label: 'Name', type: 'text' }],
  })
  const documentViewer = {
    isConnected: true,
    sourceValues: [source],
    pageValues: [resolvePageHtml(source)],
    printValue: {},
    slotOptions: { source: { id: 'person', values: { name: 'Avi' } } } as SlotsOptions,
    slotGeneration: 0,
    slotPreparation: undefined,
    filledHtml: undefined as string[] | undefined,
    resolvedSlots: undefined,
    resolvedGeneration: 0,
    pageDayContexts: [],
    observer: null,
    pageObserver: null,
    style: { removeProperty() {} },
    replaceChildren() {},
    cancelSlotPreparation: (SegnaviaDocument.prototype as unknown as { cancelSlotPreparation(): void }).cancelSlotPreparation,
    paintResolved() {},
    dispatchEvent() {
      return true
    },
    paint: (SegnaviaDocument.prototype as unknown as { paint(): void }).paint,
  }

  documentViewer.paint()
  await new Promise((resolve) => setTimeout(resolve, 0))
  const filled = documentViewer.filledHtml?.[0]
  expect(filled).toContain('Avi')
  expect(filled).toContain('2026-11-14')
  expect((documentViewer.pageDayContexts as Array<{ slots: SlotsOptions }>)[0]?.slots).toEqual({})
})

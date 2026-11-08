import { expect, test } from 'bun:test'
import { Document, Imposition, impose, pageFromDocument } from '@segnavia/format'
import { resolvePageHtml } from '@segnavia/html'
import { pageDocument } from './page-document.test-helper.ts'

class TestElement extends EventTarget {}
Object.assign(globalThis, {
  HTMLElement: TestElement,
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
  matchMedia: () => ({ matches: false }),
  window: { addEventListener() {}, removeEventListener() {} },
})

const { SegnaviaDocument } = await import('./document.ts')
const { SegnaviaPage } = await import('./page.ts')
const { SegnaviaPaper } = await import('./paper.ts')

test('page re-runs its document edge when brands changes', () => {
  const input = pageDocument('<p>Body</p>', 'refuse')
  const loaded: unknown[] = []
  const page = { pageInput: input, load: (value: unknown) => loaded.push(value) }
  Object.setPrototypeOf(page, SegnaviaPage.prototype)
  ;(page as unknown as InstanceType<typeof SegnaviaPage>).brands = { source: { brand: async () => undefined } }
  expect(loaded).toEqual([input])
})

test('paper re-resolves its document brands when the source changes', async () => {
  const document = Document.parse({
    type: 'document',
    kind: 'page',
    brand: 'house',
    children: [{ type: 'page', body: { html: '<p>Body</p>' } }],
  })
  const imposition = Imposition.parse({ paper: 'a4', columns: 1, rows: 1, cell: { width: 100, height: 100 } })
  const resolved: string[] = []
  const paper = {
    isConnected: true,
    pages: [resolvePageHtml(pageFromDocument(document))],
    brandDocuments: [document],
    brandGeneration: 0,
    resolvedBrandGeneration: -1,
    brandOptions: undefined,
    imposition,
    imposed: impose(imposition, 1),
    slotGeneration: 0,
    motifOptions: undefined,
    fontOptions: undefined,
    placementOptions: undefined,
    cancelSlotPreparation: (SegnaviaPaper.prototype as unknown as { cancelSlotPreparation(): void }).cancelSlotPreparation,
    paintResolved: () => {},
    dispatchEvent: () => true,
    paint: (SegnaviaPaper.prototype as unknown as { paint(): void }).paint,
  }
  Object.setPrototypeOf(paper, SegnaviaPaper.prototype)
  const setBrands = Object.getOwnPropertyDescriptor(SegnaviaPaper.prototype, 'brands')?.set
  const source = (css: string) => ({
    source: {
      brand: async (name: string) => {
        resolved.push(name)
        return { css }
      },
    },
  })
  setBrands?.call(paper, source('.house{color:red}'))
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(paper.pages[0]?.brand).toEqual({ css: '.house{color:red}' })
  setBrands?.call(paper, source('.house{color:blue}'))
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(resolved).toEqual(['house', 'house'])
  expect(paper.pages[0]?.brand).toEqual({ css: '.house{color:blue}' })
})

test('paper reports a brand refusal without painting its unbranded pages', async () => {
  const brandDocument = Document.parse({
    type: 'document',
    kind: 'page',
    brand: 'house',
    children: [{ type: 'page', body: { html: '<p>Body</p>' } }],
  })
  const imposition = Imposition.parse({ paper: 'a4', columns: 1, rows: 1, cell: { width: 100, height: 100 } })
  const errors: unknown[] = []
  let paints = 0
  const paper = {
    isConnected: true,
    pages: [resolvePageHtml(pageFromDocument(brandDocument))],
    brandDocuments: [brandDocument],
    brandGeneration: 0,
    resolvedBrandGeneration: -1,
    brandOptions: undefined,
    imposition,
    imposed: impose(imposition, 1),
    slotGeneration: 0,
    motifOptions: undefined,
    fontOptions: undefined,
    placementOptions: undefined,
    cancelSlotPreparation: (SegnaviaPaper.prototype as unknown as { cancelSlotPreparation(): void }).cancelSlotPreparation,
    paintResolved: () => paints++,
    dispatchEvent: (event: ErrorEvent) => {
      errors.push(event.error)
      return true
    },
    paint: (SegnaviaPaper.prototype as unknown as { paint(): void }).paint,
  }
  paper.paint()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(errors).toHaveLength(1)
  expect(String(errors[0])).toContain('without a BrandSource')
  expect(paints).toBe(0)
})

test('document element resolves a named brand before keeping lowered pages', async () => {
  const sourceDocument = Document.parse({
    type: 'document',
    kind: 'page',
    brand: 'house',
    children: [{ type: 'page', body: { html: '<p>Branded</p>' } }],
  })
  const element = {
    sourceDocuments: [sourceDocument],
    sourceValues: [] as Array<{ brand?: unknown }>,
    pageValues: [],
    brandOptions: { source: { brand: async () => ({ css: '.house{color:red}' }) } },
    paint() {},
    dispatchEvent: () => true,
  }
  const resolveDocuments = (SegnaviaDocument.prototype as unknown as { resolveDocuments(documents: Document[]): void }).resolveDocuments
  resolveDocuments.call(element, element.sourceDocuments)
  expect(element.sourceValues).toHaveLength(0)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(element.sourceValues[0]?.brand).toEqual({ css: '.house{color:red}' })
})

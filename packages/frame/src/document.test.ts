import { expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
import { resolvePageHtml } from '@segnavia/html'
import { DocumentBrandLoader } from './document-brand-resolution.ts'
import { internalDocumentPagesLoad } from './document-value-load.ts'

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

test('an edition change keeps internally loaded document pages', () => {
  const page = Page.parse({ html: '<p>Internal</p>' })
  const element = Object.create(SegnaviaDocument.prototype) as InstanceType<typeof SegnaviaDocument>
  Object.assign(element, {
    editionDocuments: [],
    sourceDocuments: [],
    sourceValues: [],
    pageValues: [],
    origins: [],
    paint() {},
    changed() {},
  })
  Object.defineProperty(element, 'edition', { configurable: true, value: 'teacher' })
  Reflect.set(
    element,
    'brandResolution',
    new DocumentBrandLoader(
      () => Reflect.get(element, 'sourceDocuments'),
      () => {
        Reflect.set(element, 'sourceValues', [])
        Reflect.set(element, 'pageValues', [])
      },
      (sources, pages) => {
        Reflect.set(element, 'sourceValues', sources)
        Reflect.set(element, 'pageValues', pages)
      },
      (error) => {
        throw error
      },
    ),
  )
  element[internalDocumentPagesLoad]([page])

  element.attributeChangedCallback('edition')

  expect(Reflect.get(element, 'sourceValues')).toEqual([page])
  expect(Reflect.get(element, 'pageValues')).toEqual([resolvePageHtml(page)])
})

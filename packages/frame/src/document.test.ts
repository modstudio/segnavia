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

const editionPage = (html = '<p>Question<span data-segnavia-condition="teacher"> Answer</span></p>') => ({
  type: 'document' as const,
  kind: 'page' as const,
  conditions: [{ type: 'condition' as const, name: 'teacher' }],
  editions: [
    { type: 'edition' as const, name: 'student', conditions: [] },
    { type: 'edition' as const, name: 'teacher', conditions: ['teacher'] },
  ],
  defaultEdition: 'student',
  children: [{ type: 'page' as const, body: { html } }],
})

function documentHarness(edition: string) {
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
  Object.defineProperty(element, 'edition', { configurable: true, writable: true, value: edition })
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
  return element
}

test('an edition change keeps internally loaded document pages', () => {
  const page = Page.parse({ html: '<p>Internal</p>' })
  const element = documentHarness('teacher')
  element[internalDocumentPagesLoad]([page])

  element.attributeChangedCallback('edition')

  expect(Reflect.get(element, 'sourceValues')).toEqual([page])
  expect(Reflect.get(element, 'pageValues')).toEqual([resolvePageHtml(page)])
})

test('an edition change re-resolves retained document pages', () => {
  const element = documentHarness('student')
  element.pages = [editionPage()]
  expect(JSON.stringify(Reflect.get(element, 'sourceValues'))).not.toContain('Answer')

  element.edition = 'teacher'
  element.attributeChangedCallback('edition')

  expect(JSON.stringify(Reflect.get(element, 'sourceValues'))).toContain('Answer')
})

test('a refused pages assignment keeps the prior document state', () => {
  const element = documentHarness('student')
  element.pages = [editionPage()]
  const editionDocuments = Reflect.get(element, 'editionDocuments')
  const sourceDocuments = Reflect.get(element, 'sourceDocuments')
  element.edition = 'missing'

  expect(() => (element.pages = [editionPage('<p>Replacement</p>')])).toThrow('requested edition "missing" is unknown')
  expect(Reflect.get(element, 'editionDocuments')).toBe(editionDocuments)
  expect(Reflect.get(element, 'sourceDocuments')).toBe(sourceDocuments)
})

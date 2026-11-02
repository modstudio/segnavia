import { expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
import { bodyHtml } from '@segnavia/html'
import { renderPageDocument } from './page-document.ts'

test('a non-imposed printed named page lays out at its overridden measure and centers on the sheet', () => {
  const page = Page.parse({ html: '<p>Measured</p>', size: { width: 'standard', height: 'auto' }, print: { paper: 'poster-12x18' } })
  const html = renderPageDocument(page, { pageWidths: { standard: 900 } }, true, 'test')
  expect(html).toContain(':where(body){max-inline-size:900px;margin-inline:auto}')
})

test('a full printed page has no measure rule', () => {
  const page = Page.parse({ html: '<p>Full</p>', print: { paper: 'poster-12x18' } })
  expect(renderPageDocument(page, {}, true, 'test')).not.toContain('max-inline-size:')
})

test('a markdown page and its HTML equivalent build the same frame document', () => {
  const markdown = Page.parse({ markdown: '# שלום\n\nEnglish text.', size: { width: 600, height: 400 } })
  const equivalent = Page.parse({ html: bodyHtml(markdown.body, { dir: markdown.dir, lang: markdown.lang }), size: markdown.size })
  expect(renderPageDocument(markdown, {}, false, 'test')).toBe(renderPageDocument(equivalent, {}, false, 'test'))
})

test('inlines the offline diagram renderer only for a diagram body', () => {
  const plain = renderPageDocument({ markdown: '# Plain' }, {}, false, 'test')
  const diagram = renderPageDocument({ markdown: '```mermaid\nflowchart TD\n  A --> B\n```' }, {}, false, 'test')
  expect(plain).not.toContain('data-segnavia-diagrams-drawn')
  expect(diagram).toContain('data-segnavia-diagrams-drawn')
  expect(diagram).toContain('<script nonce="test">')
})

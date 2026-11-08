import { expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
import { markdownHtml } from '@segnavia/html'
import { RenderRefusedError } from './errors.ts'
import { renderPageValueDocument } from './page-document.ts'

test('a non-imposed printed named page lays out at its overridden measure and centers on the sheet', () => {
  const page = Page.parse({ html: '<p>Measured</p>', size: { width: 'standard', height: 'auto' }, print: { paper: 'poster-12x18' } })
  const html = renderPageValueDocument(page, { pageWidths: { standard: 900 } }, true, 'test')
  expect(html).toContain(':where(body){max-inline-size:900px;margin-inline:auto}')
})

test('a full printed page has no measure rule', () => {
  const page = Page.parse({ html: '<p>Full</p>', print: { paper: 'poster-12x18' } })
  expect(renderPageValueDocument(page, {}, true, 'test')).not.toContain('max-inline-size:')
})

test('the value renderer refuses markdown that skipped the Document content edge', () => {
  const markdown = Page.parse({ markdown: '# שלום\n\nEnglish text.', size: { width: 600, height: 400 } })
  expect(() => renderPageValueDocument(markdown, {}, false, 'test')).toThrow('pass its Document input through @segnavia/html parseDocument')
})

test('inlines the offline diagram renderer only for a diagram body', () => {
  const plain = renderPageValueDocument(Page.parse({ html: markdownHtml({ markdown: '# Plain' }) }), {}, false, 'test', '', 'DRAW')
  const diagram = renderPageValueDocument(
    Page.parse({ html: markdownHtml({ markdown: '```mermaid\nflowchart TD\n  A --> B\n```' }) }),
    {},
    false,
    'test',
    '',
    'DRAW',
  )
  expect(plain).not.toContain('DRAW')
  expect(diagram).toContain('DRAW')
  expect(diagram).toContain('<script nonce="test">')
})

test('converts a style compile refusal into RenderRefusedError', () => {
  const page = Page.parse({ html: '<p>Body</p>', style: { textStyles: { body: { kind: 'paragraph', basedOn: 'missing' } } } })
  expect(() => renderPageValueDocument(page, {}, false, 'test')).toThrow(RenderRefusedError)
  expect(() => renderPageValueDocument(page, {}, false, 'test')).toThrow(/textStyles\.body\.basedOn.*clear this refusal/)
})

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

test('printed page margins follow the resolved page direction', () => {
  const print = {
    paper: { width: 148, height: 105, unit: 'mm' as const },
    orientation: 'landscape' as const,
    margin: { blockStart: 1, blockEnd: 3, inlineStart: 4, inlineEnd: 2 },
    bleed: 3,
  }
  const byLanguage = Page.parse({ html: '<p>Hello</p>', lang: 'he', print })
  const byAuthoredRoot = Page.parse({ html: '<html dir="rtl"><body>Hello</body></html>', print })
  expect(renderPageValueDocument(byLanguage, {}, true, 'test')).toContain('padding:4mm 7mm 6mm 5mm')
  expect(renderPageValueDocument(byAuthoredRoot, {}, true, 'test')).toContain('padding:4mm 7mm 6mm 5mm')
})

test('resolves the rendered page root direction while preserving an authored direction', () => {
  const hebrew = Page.parse({ html: '<p>Hello</p>', lang: 'he' })
  const firstStrong = Page.parse({ html: '<p>שלום</p>' })
  const authored = Page.parse({ html: '<html dir="ltr"><body>שלום</body></html>' })
  expect(renderPageValueDocument(hebrew, {}, false, 'test')).toContain('<html dir="rtl" lang="he">')
  expect(renderPageValueDocument(firstStrong, {}, false, 'test')).toContain('<html dir="rtl">')
  const authoredHtml = renderPageValueDocument(authored, {}, false, 'test')
  expect(authoredHtml).toContain('<html dir="ltr">')
  expect(authoredHtml.match(/<html[^>]*\sdir\s*=/gi)).toHaveLength(1)
})

test('the value renderer lowers a markdown-only page', () => {
  const markdown = Page.parse({ markdown: '# שלום\n\nEnglish text.', size: { width: 600, height: 400 } })
  const rendered = renderPageValueDocument(markdown, {}, false, 'test')
  expect(rendered).toContain('<h1 id="שלום">שלום</h1>')
  expect(rendered).toContain('<html dir="rtl">')
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

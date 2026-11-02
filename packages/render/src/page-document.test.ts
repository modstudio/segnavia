import { expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
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

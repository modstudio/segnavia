import { expect, test } from 'bun:test'
import type { HtmlPage } from '@segnavia/html'
import { shownPageDocument } from './shown-page-document.ts'

test('resolves the shown page root direction from visible HTML text', () => {
  const page = { html: '<p>שלום</p>', scripts: 'refuse', size: { width: 600, height: 400 } } as HtmlPage
  expect(shownPageDocument(page, undefined, { nonce: 'test' })).toContain('<html dir="rtl"><body>')
})

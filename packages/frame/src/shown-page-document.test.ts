import { expect, test } from 'bun:test'
import type { HtmlPage } from '@segnavia/html'
import { shownPageDocument } from './shown-page-document.ts'
import { EMPTY_SLOTS } from './slot-render.ts'

test('resolves the shown page root direction from visible HTML text', () => {
  const page = { html: '<p>שלום</p>', scripts: 'refuse', size: { width: 600, height: 400 } } as HtmlPage
  expect(shownPageDocument(page, undefined, { nonce: 'test' })).toContain('<html dir="rtl"><body>')
})

test('resolves the shown page root direction from filled slot HTML', () => {
  const page = { html: '<p><span data-slot="greeting"></span></p>', scripts: 'refuse', size: { width: 600, height: 400 } } as HtmlPage
  const resolved = { ...EMPTY_SLOTS, apply: () => '<p>שלום</p>' }
  expect(shownPageDocument(page, resolved, { nonce: 'test' })).toContain('<html dir="rtl"><body>')
})

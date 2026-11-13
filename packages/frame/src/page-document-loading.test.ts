import { afterEach, expect, test } from 'bun:test'
import type { HtmlPage, PreparedSlots } from '@segnavia/html'
import { registerDiagramProvider } from './diagram-document.ts'
import { registerLayoutProvider, resetLayoutProvidersForTest } from './layout.ts'
import { loadPageDocument, loadPrintedPageDocument, loadShownPageDocument } from './page-document-loading.ts'

afterEach(resetLayoutProvidersForTest)

const page = { html: '<pre data-segnavia-diagram="mermaid"><code>flowchart TD</code></pre>', scripts: 'refuse', size: { width: 600, height: 400 } } as HtmlPage

test('a registered diagram provider is injected through the layout runtime', async () => {
  registerDiagramProvider(async () => 'window.segnaviaLayout.define({galley(){globalThis.DRAW=true}})')
  const document = await new Promise<string>((resolve, reject) => loadPageDocument(page, { scripts: 'refuse' }, resolve, reject))
  expect(document).toContain('window.segnaviaLayout.define({galley(){globalThis.DRAW=true}})')
  expect(document).toContain('name":"diagram')
})

test('a registered diagram provider is injected into a printed page document', async () => {
  registerDiagramProvider(async () => 'window.segnaviaLayout.define({galley(){globalThis.PRINTED_DRAW=true}})')
  const printed = {
    ...page,
    print: { paper: 'letter' },
    printedPages: { parents: [{ name: 'body' }], parentRules: [{ parent: 'body' }] },
  } as HtmlPage
  const document = await new Promise<string>((resolve, reject) => loadPrintedPageDocument(printed, { screen: { spread: false } }, resolve, reject))
  expect(document).toContain('window.segnaviaLayout.define({galley(){globalThis.PRINTED_DRAW=true}})')
})

test('a refusal while building the deferred shown document reaches the error path', async () => {
  registerDiagramProvider(async () => 'window.segnaviaLayout.define({galley(){}})')
  const refusal = new Error('slot refusal')
  const resolved = {
    apply: () => {
      throw refusal
    },
  } as unknown as PreparedSlots
  const error = await new Promise<unknown>((resolve) => {
    loadShownPageDocument(page, resolved, {}, () => {}, resolve)
  })
  expect(error).toBe(refusal)
})

test('a rejecting provider follows the document load failure path', async () => {
  registerLayoutProvider('broken', { script: async () => Promise.reject(new Error('provider unavailable')) })
  const broken = { ...page, html: '<p data-segnavia-layout="broken">x</p>' }
  const error = await new Promise<unknown>((resolve) => loadPageDocument(broken, { scripts: 'refuse' }, () => {}, resolve))
  expect(String(error)).toContain('provider unavailable')
})

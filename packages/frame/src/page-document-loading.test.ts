import { expect, test } from 'bun:test'
import type { HtmlPage, PreparedSlots } from '@segnavia/html'
import { loadPageDocument, loadShownPageDocument } from './page-document-loading.ts'

const page = {
  html: '<pre data-segnavia-diagram="mermaid"><code>flowchart TD</code></pre>',
  scripts: 'refuse',
  size: { width: 600, height: 400 },
} as HtmlPage

test('a failed diagram entry reports the error and writes the source fallback', async () => {
  const refusal = new Error('diagram entry unavailable')
  const result = await new Promise<{ document: string; errors: unknown[] }>((resolve) => {
    const errors: unknown[] = []
    loadPageDocument(
      page,
      { scripts: 'refuse' },
      (document) => resolve({ document, errors }),
      (error) => errors.push(error),
      () => Promise.reject(refusal),
    )
  })
  expect(result.errors).toEqual([refusal])
  expect(result.document).toContain('<code>flowchart TD</code>')
  expect(result.document).not.toContain('data-segnavia-diagrams-drawn')
})

test('a refusal while building the deferred shown document reaches the error path', async () => {
  const refusal = new Error('slot refusal')
  const resolved = {
    apply: () => {
      throw refusal
    },
  } as unknown as PreparedSlots
  const error = await new Promise<unknown>((resolve) => {
    loadShownPageDocument(
      page,
      resolved,
      {},
      () => {},
      resolve,
      () => Promise.resolve('DRAW'),
    )
  })
  expect(error).toBe(refusal)
})

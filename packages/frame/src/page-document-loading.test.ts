import { afterEach, expect, test } from 'bun:test'
import type { HtmlPage, PreparedSlots } from '@segnavia/html'
import { registerDiagramProvider } from './diagram-document.ts'
import { loadPageDocument, loadShownPageDocument } from './page-document-loading.ts'

const DIAGRAM_PROVIDER_KEY = Symbol.for('segnavia.diagrams')
const registry = globalThis as typeof globalThis & { [DIAGRAM_PROVIDER_KEY]?: () => Promise<string> }

afterEach(() => {
  delete registry[DIAGRAM_PROVIDER_KEY]
})

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

test('an absent provider follows the existing page load failure path', async () => {
  const result = await new Promise<{ document: string; errors: unknown[] }>((resolve) => {
    const errors: unknown[] = []
    loadPageDocument(
      page,
      { scripts: 'refuse' },
      (document) => resolve({ document, errors }),
      (error) => errors.push(error),
    )
  })
  expect(result.errors).toHaveLength(1)
  expect(String(result.errors[0])).toContain('no diagram provider is registered')
  expect(result.document).toContain('<code>flowchart TD</code>')
})

test('a registered provider script is injected into the page document', async () => {
  registerDiagramProvider(() => Promise.resolve('globalThis.DIAGRAM_PROVIDER_RAN = true'))
  const document = await new Promise<string>((resolve, reject) => {
    loadPageDocument(page, { scripts: 'refuse' }, resolve, reject)
  })
  expect(document).toContain('<script nonce=')
  expect(document).toContain('globalThis.DIAGRAM_PROVIDER_RAN = true</script>')
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

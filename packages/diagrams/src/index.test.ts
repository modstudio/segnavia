import { afterEach, expect, test } from 'bun:test'
import { loadDiagramScript } from '@segnavia/frame/diagrams'

const DIAGRAM_PROVIDER_KEY = Symbol.for('segnavia.diagrams')
const registry = globalThis as typeof globalThis & { [DIAGRAM_PROVIDER_KEY]?: () => Promise<string> }

afterEach(() => {
  delete registry[DIAGRAM_PROVIDER_KEY]
})

test('the main entry does not register while the auto entry does', async () => {
  await import('./index.ts')
  expect(registry[DIAGRAM_PROVIDER_KEY]).toBeUndefined()

  await import('./auto.ts')
  expect(registry[DIAGRAM_PROVIDER_KEY]).toBeFunction()
  expect(await loadDiagramScript('<pre data-segnavia-diagram="mermaid"></pre>')).toContain('mermaid')
})

import { afterEach, expect, test } from 'bun:test'
import { loadLayoutScripts, resetLayoutProvidersForTest } from '@segnavia/frame/layout'

afterEach(resetLayoutProvidersForTest)

test('the automatic entry registers the diagram layout provider', async () => {
  await import('./auto.ts')
  expect((await loadLayoutScripts('<pre data-segnavia-diagram="mermaid"></pre>'))[0]?.script).toContain('mermaid')
})

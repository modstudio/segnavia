import { afterEach, expect, test } from 'bun:test'
import { registerDiagramProvider } from '@segnavia/frame/diagrams'
import { resetLayoutProvidersForTest } from '@segnavia/frame/layout'
import { RenderRefusedError } from './errors.ts'
import { resolveRenderLayoutScripts } from './render-layout-scripts.ts'

const diagram = '<pre data-segnavia-diagram="mermaid"><code>flowchart TD</code></pre>'
afterEach(resetLayoutProvidersForTest)

test('does not import the diagram package for plain content', async () => {
  expect(await resolveRenderLayoutScripts('<p>Plain</p>', async () => Promise.reject(new Error('must not import')))).toEqual([])
})

test('loads the optional package as a layout provider', async () => {
  const scripts = await resolveRenderLayoutScripts(diagram, async () => ({ diagrams: async () => 'OPTIONAL' }))
  expect(scripts[0]).toMatchObject({ name: 'diagram', script: 'OPTIONAL' })
})

test('refuses when the optional provider is unavailable', async () => {
  const resolving = resolveRenderLayoutScripts(diagram, async () => Promise.reject(new Error('missing')))
  expect(resolving).rejects.toBeInstanceOf(RenderRefusedError)
  expect(resolving).rejects.toThrow('missing')
})

test('prefers a registered provider', async () => {
  registerDiagramProvider(async () => 'REGISTERED')
  expect((await resolveRenderLayoutScripts(diagram, async () => Promise.reject(new Error('must not import'))))[0]?.script).toBe('REGISTERED')
})

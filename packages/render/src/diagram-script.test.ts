import { afterEach, expect, test } from 'bun:test'
import { registerDiagramProvider } from '@segnavia/frame/diagrams'
import { resolveDiagramScript } from './diagram-script.ts'
import { RenderRefusedError } from './errors.ts'

const diagram = '<pre data-segnavia-diagram="mermaid"><code>flowchart TD</code></pre>'
const registry = globalThis as typeof globalThis & { [key: symbol]: unknown }
const providerKey = Symbol.for('segnavia.diagrams')

afterEach(() => {
  delete registry[providerKey]
})

test('does not import the diagram package when the content has no diagram', async () => {
  const script = await resolveDiagramScript('<p>Plain</p>', async () => {
    throw new Error('The diagram package must not be imported.')
  })
  expect(script).toBeUndefined()
})

test('loads the optional diagram package when no provider is registered', async () => {
  expect(await resolveDiagramScript(diagram, async () => ({ diagrams: async () => 'OPTIONAL' }))).toBe('OPTIONAL')
})

test('refuses a diagram when neither source is available', async () => {
  const resolving = resolveDiagramScript(diagram, async () => {
    throw new Error('missing')
  })
  expect(resolving).rejects.toBeInstanceOf(RenderRefusedError)
  expect(resolving).rejects.toThrow('install @segnavia/diagrams, or call registerDiagramProvider')
})

test('prefers the registered diagram provider', async () => {
  registerDiagramProvider(async () => 'REGISTERED')
  expect(
    await resolveDiagramScript(diagram, async () => {
      throw new Error('The diagram package must not be imported.')
    }),
  ).toBe('REGISTERED')
})

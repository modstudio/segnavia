import { afterEach, describe, expect, test } from 'bun:test'
import { hasDiagram, loadDiagramScript, registerDiagramProvider, withDiagramScript } from './diagram-document.ts'

const DIAGRAM_PROVIDER_KEY = Symbol.for('segnavia.diagrams')
const registry = globalThis as typeof globalThis & { [DIAGRAM_PROVIDER_KEY]?: () => Promise<string> }

afterEach(() => {
  delete registry[DIAGRAM_PROVIDER_KEY]
})

describe('diagram script loading', () => {
  test('is decided only by the final document body', () => {
    expect(hasDiagram('<pre data-segnavia-diagram="mermaid"><code>flowchart TD</code></pre>')).toBe(true)
    expect(hasDiagram('<div data-segnavia-diagram="mermaid"><code>flowchart TD</code></div>')).toBe(false)
    expect(hasDiagram('<pre><code class="language-mermaid">flowchart TD</code></pre>')).toBe(false)
  })

  test('inlines the nonce script only when a placeholder is present', () => {
    const plain = '<p>Plain</p>'
    expect(withDiagramScript(plain, 'held', 'DRAW')).toBe(plain)
    expect(withDiagramScript('<body><pre data-segnavia-diagram="mermaid"></pre></body>', 'held', 'DRAW')).toBe(
      '<body><pre data-segnavia-diagram="mermaid"></pre><script nonce="held">DRAW</script></body>',
    )
  })

  test('keeps replacement tokens literal before a closing body', () => {
    const html = '<body><p>AUTHOR_TEXT_OUTSIDE_SCRIPT</p><pre data-segnavia-diagram="mermaid"></pre></body>'
    const tokens = `var values = ["$&", "${'$`'}", "$'", "$$"];`
    const tokenOutput = withDiagramScript(html, 'held', tokens)
    expect(tokenOutput).toContain(`<script nonce="held">${tokens}</script>`)
    expect(tokenOutput.match(/AUTHOR_TEXT_OUTSIDE_SCRIPT/g)).toHaveLength(1)
    expect(tokenOutput.match(/<script nonce="held">([\s\S]*?)<\/script>/)?.[1]).not.toContain('AUTHOR_TEXT_OUTSIDE_SCRIPT')
  })

  test('refuses a placeholder when no provider is registered', async () => {
    expect(loadDiagramScript('<pre data-segnavia-diagram="mermaid"></pre>')).rejects.toThrow(
      "This page draws a diagram, but no diagram provider is registered. Call registerDiagramProvider(diagrams) from '@segnavia/diagrams', or import '@segnavia/diagrams/auto', to draw it.",
    )
  })

  test('uses a provider registered through the shared global slot', async () => {
    registry[DIAGRAM_PROVIDER_KEY] = () => Promise.resolve('DRAW')
    expect(await loadDiagramScript('<pre data-segnavia-diagram="mermaid"></pre>')).toBe('DRAW')

    registerDiagramProvider(() => Promise.resolve('REPLACED'))
    expect(await loadDiagramScript('<pre data-segnavia-diagram="mermaid"></pre>')).toBe('REPLACED')
  })
})

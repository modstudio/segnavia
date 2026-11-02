import { describe, expect, test } from 'bun:test'
import { hasDiagram, withDiagramScript } from './diagram-document.ts'

describe('diagram script loading', () => {
  test('is decided only by the final document body', () => {
    expect(hasDiagram('<pre data-segnavia-diagram="mermaid"><code>flowchart TD</code></pre>')).toBe(true)
    expect(hasDiagram('<pre><code class="language-mermaid">flowchart TD</code></pre>')).toBe(false)
  })

  test('inlines the nonce script only when a placeholder is present', () => {
    const plain = '<p>Plain</p>'
    expect(withDiagramScript(plain, 'held', 'DRAW')).toBe(plain)
    expect(withDiagramScript('<body><pre data-segnavia-diagram="mermaid"></pre></body>', 'held', 'DRAW')).toBe(
      '<body><pre data-segnavia-diagram="mermaid"></pre><script nonce="held">DRAW</script></body>',
    )
  })
})

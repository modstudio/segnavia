import { afterEach, expect, test } from 'bun:test'
import { DIAGRAM_SELECTOR, hasDiagram, registerDiagramProvider } from './diagram-document.ts'
import { loadLayoutScripts, resetLayoutProvidersForTest } from './layout.ts'

afterEach(resetLayoutProvidersForTest)

test('recognizes only Mermaid placeholders', () => {
  expect(hasDiagram('<pre data-segnavia-diagram="mermaid"></pre>')).toBe(true)
  expect(hasDiagram('<div data-segnavia-diagram="mermaid"></div>')).toBe(false)
})

test('registers the compatibility provider through the layout runtime', async () => {
  registerDiagramProvider(async () => 'DRAW')
  expect(await loadLayoutScripts('<pre data-segnavia-diagram="mermaid"></pre>')).toEqual([
    { name: 'diagram', script: 'DRAW', priority: 0, order: 0, selects: DIAGRAM_SELECTOR },
  ])
})

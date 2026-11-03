import { describe, expect, test } from 'bun:test'
import { EDITOR_CSS } from './editor-css.ts'

describe('markdown editor styles', () => {
  test('every selector sits wholly inside :where()', () => {
    const selectors = [...EDITOR_CSS.matchAll(/(?:^|[}\n])\s*([^{}@]+)\{/g)].map((match) => (match[1] ?? '').trim()).filter(Boolean)
    expect(selectors.length).toBeGreaterThan(5)
    for (const selector of selectors) {
      for (const part of selector.split(',')) expect(part.trim()).toMatch(/^:where\(.*\)$/)
    }
  })

  test('every selector is scoped to a styled markdown editor', () => {
    const selectors = [...EDITOR_CSS.matchAll(/(?:^|[}\n])\s*([^{}@]+)\{/g)].map((match) => (match[1] ?? '').trim()).filter(Boolean)
    expect(selectors.length).toBeGreaterThan(5)
    for (const selector of selectors) {
      for (const part of selector.split(',')) expect(part).toContain(':host(segnavia-markdown-editor:not([unstyled]))')
    }
  })

  test('color literals appear only as custom-property defaults', () => {
    for (const color of EDITOR_CSS.match(/#[0-9a-f]{3,8}\b|rgb\(/gi) ?? []) {
      expect(EDITOR_CSS).toMatch(new RegExp(`var\\(--segnavia-[a-z-]+,${color.replace('(', '\\(')}`))
    }
  })
})

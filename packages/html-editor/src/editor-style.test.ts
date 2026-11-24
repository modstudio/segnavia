import './prosemirror-environment.test-helper.ts'
import { describe, expect, test } from 'bun:test'
import { EDITOR_CSS } from './editor-css.ts'

describe('HTML editor styles', () => {
  test('every selector sits wholly inside :where()', () => {
    const selectors = [...EDITOR_CSS.matchAll(/(?:^|[}\n])\s*([^{}@]+)\{/g)].map((match) => (match[1] ?? '').trim()).filter(Boolean)
    expect(selectors.length).toBeGreaterThan(2)
    for (const selector of selectors) for (const part of selector.split(',')) expect(part.trim()).toMatch(/^:where\(.*\)$/)
  })

  test('selectors are scoped to the styled HTML editor and colors use Segnavia fallbacks', () => {
    const selectors = [...EDITOR_CSS.matchAll(/(?:^|[}\n])\s*([^{}@]+)\{/g)].map((match) => (match[1] ?? '').trim()).filter(Boolean)
    for (const selector of selectors) expect(selector).toContain(':host(segnavia-html-editor:not([unstyled]))')
    for (const color of EDITOR_CSS.match(/#[0-9a-f]{3,8}\b|rgb\(/gi) ?? []) {
      expect(EDITOR_CSS).toMatch(new RegExp(`var\\(--segnavia-[a-z-]+,${color.replace('(', '\\(')}`))
    }
  })
})

import { describe, expect, test } from 'bun:test'
import { BASE_CSS } from './base-style.ts'

// The headless elements promise a host never has to fight their styles: every
// rule they bring has zero specificity, so any rule a host writes wins.
describe('headless base styles', () => {
  test('every selector sits wholly inside :where()', () => {
    const selectors = [...BASE_CSS.matchAll(/(?:^|[}\n])\s*([^{}@]+)\{/g)].map((match) => (match[1] ?? '').trim()).filter(Boolean)
    expect(selectors.length).toBeGreaterThan(5)
    for (const selector of selectors) {
      for (const part of selector.split(',')) expect(part.trim()).toMatch(/^:where\(.*\)$/)
    }
  })

  test('every selector excludes an unstyled root element', () => {
    const selectors = BASE_CSS.match(/:where\(segnavia-(?:stage|page)/g) ?? []
    const exclusions = BASE_CSS.match(/:where\(segnavia-(?:stage|page):not\(\[unstyled\]\)/g) ?? []
    expect(selectors.length).toBeGreaterThan(5)
    expect(exclusions).toHaveLength(selectors.length)
  })

  test('appearance arrives only as custom properties with plain defaults', () => {
    for (const colour of BASE_CSS.match(/#[0-9a-f]{3,8}\b|rgb\(/gi) ?? []) {
      expect(BASE_CSS).toMatch(new RegExp(`var\\(--segnavia-[a-z-]+,${colour.replace('(', '\\(')}`))
    }
  })
})

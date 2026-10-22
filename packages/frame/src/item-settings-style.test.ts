import { expect, test } from 'bun:test'
import { ITEM_SETTINGS_CSS } from './item-settings-style.ts'

test('item settings geometry selectors sit inside :where() and colour only through custom properties', () => {
  const selectors = [...ITEM_SETTINGS_CSS.matchAll(/(?:^|[}\n])\s*([^{}@]+)\{/g)].map((match) => (match[1] ?? '').trim()).filter(Boolean)
  expect(selectors.length).toBeGreaterThan(5)
  for (const selector of selectors) {
    for (const part of selector.split(',')) expect(part.trim()).toMatch(/^:where\(.*\)$/)
  }
  for (const color of ITEM_SETTINGS_CSS.match(/#[0-9a-f]{3,8}\b|rgb\(/gi) ?? []) {
    expect(ITEM_SETTINGS_CSS).toMatch(new RegExp(`var\\(--segnavia-[a-z-]+,${color.replace('(', '\\(')}`))
  }
})

test('item settings controls take their corner radius from --segnavia-radius', () => {
  expect(ITEM_SETTINGS_CSS).toMatch(/:where\(input\),:where\(select\),:where\(button\)\{[^}]*border-radius:var\(--segnavia-radius,0\)/)
})

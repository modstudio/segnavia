import { expect, test } from 'bun:test'
import { ITEM_SETTINGS_CSS } from './item-settings-style.ts'

test('item settings geometry selectors sit inside :where() and color only through custom properties', () => {
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

test('item settings type, control, spacing, and focus defaults are host-overridable', () => {
  const defaults = {
    'button-padding-inline': '.75rem',
    'control-padding-block': '.4rem',
    'control-padding-inline': '.6rem',
    'control-size': '2.25rem',
    'focus-ring-color': 'var(--segnavia-accent,currentColor)',
    'focus-ring-offset': '1px',
    'focus-ring-width': '2px',
    'gap-large': '.75rem',
    'gap-medium': '.5rem',
    'gap-small': '.25rem',
    'gap-xlarge': '1.25rem',
    'label-size': '.85rem',
    'title-size': '.95rem',
    'title-weight': '600',
  }

  for (const [property, fallback] of Object.entries(defaults)) {
    expect(ITEM_SETTINGS_CSS).toContain(`var(--segnavia-${property},${fallback})`)
  }
  expect(ITEM_SETTINGS_CSS).toContain(':where(input:focus-visible),:where(select:focus-visible),:where(button:focus-visible)')
})

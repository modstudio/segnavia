import { expect, test } from 'bun:test'
import { fillAsOfBindings } from './as-of-bindings.ts'

test('fills only the reserved asOf root and leaves host slots for their own pass', () => {
  const html = '<time data-slot-value="asOf.date"></time><b data-slot-value="asOf.anchor"></b><span data-slot-value="name">Name</span>'
  expect(fillAsOfBindings(html, { date: '2026-11-14', zone: 'UTC', kind: 'anchor', anchor: 'shabbos' })).toBe(
    '<time dir="auto">2026-11-14</time><b dir="auto">shabbos</b><span data-slot-value="name">Name</span>',
  )
})

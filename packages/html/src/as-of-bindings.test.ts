import { expect, test } from 'bun:test'
import { fillAsOfBindings } from './as-of-bindings.ts'

test('fills only the reserved asOf root and leaves host slots for their own pass', () => {
  const html = '<time data-slot-value="asOf.date"></time><b data-slot-value="asOf.anchor"></b><span data-slot-value="name">Name</span>'
  expect(fillAsOfBindings(html, { date: '2026-11-14', zone: 'UTC', kind: 'anchor', anchor: 'shabbos' })).toBe(
    '<time dir="auto">2026-11-14</time><b dir="auto">shabbos</b><span data-slot-value="name">Name</span>',
  )
})

test('finds unquoted and entity-encoded day bindings through the parsed page', () => {
  const html = fillAsOfBindings('<p data-slot-value=asOf&#46;date></p><i data-slot-value=person.name></i>', {
    date: '2026-11-14',
    zone: 'UTC',
    kind: 'current',
  })
  expect(html).toContain('2026-11-14')
  expect(html).toContain('data-slot-value="person.name"')
})

test('leaves a scripted page without an as-of binding unchanged', () => {
  const html = '<p id="result">waiting</p><script src="https://assets.example/page.js"></script>'
  expect(fillAsOfBindings(html, { date: '2026-11-14', zone: 'UTC', kind: 'current' })).toBe(html)
})

import { expect, test } from 'bun:test'
import { fillAsOfBindings } from './as-of-bindings.ts'
import { asOfValues, slotsWithDay } from './day-slots.ts'
import { prepareSlots } from './slots.ts'

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

test('leaves a document without a moment slot byte-identical', () => {
  const html = '<p id="result">waiting</p><script src="https://assets.example/page.js"></script>'
  expect(fillAsOfBindings(html, { date: '2026-11-14', zone: 'UTC', kind: 'current' })).toBe(html)
})

test.each(['style', 'xmp'])('refuses an as-of value binding on <%s>', (tag) => {
  expect(() =>
    fillAsOfBindings(`<${tag} data-slot-value="asOf.anchor"></${tag}>`, {
      date: '2026-11-14',
      zone: 'UTC',
      kind: 'anchor',
      anchor: '</style><script>globalThis.pwned=true</script>',
    }),
  ).toThrow(`uses a value binding on <${tag}>, whose content cannot be filled safely`)
})

test('fills an as-of value binding on a plain text element', () => {
  expect(fillAsOfBindings('<p data-slot-value="asOf.date"></p>', { date: '2026-11-14', zone: 'UTC', kind: 'current' })).toBe('<p dir="auto">2026-11-14</p>')
})

test('fills the moment as isolated auto-direction text on a Hebrew page and omits an absent moment', () => {
  const html = '<main lang="he" dir="rtl"><time data-slot-value="asOf.moment">placeholder</time></main>'
  expect(fillAsOfBindings(html, { date: '2026-11-14', zone: 'America/New_York', kind: 'current', moment: Date.parse('2026-11-14T13:00:00Z') })).toBe(
    '<main lang="he" dir="rtl"><time dir="auto">2026-11-14T08:00:00-05:00</time></main>',
  )
  const absent = { date: '2026-11-14', zone: 'America/New_York', kind: 'current' } as const
  expect(asOfValues(absent)).not.toHaveProperty('asOf.moment')
  expect(fillAsOfBindings(html, absent)).toBe('<main lang="he" dir="rtl"><time>placeholder</time></main>')
})

test('keeps absent moment furniture identical through binding and slot fills', async () => {
  const html = '<time data-slot-value="asOf.moment">Not supplied</time>'
  const day = { date: '2026-11-14', zone: 'UTC', kind: 'current' } as const
  const options = slotsWithDay(undefined, day, undefined, true)
  const prepared = await prepareSlots([], options, new AbortController().signal)
  expect(fillAsOfBindings(html, day)).toBe(prepared.apply(html))
})

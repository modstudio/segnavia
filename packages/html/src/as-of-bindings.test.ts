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

test('fills the moment as isolated left-to-right text on a Hebrew page and empties an absent moment', () => {
  const html = '<main lang="he" dir="rtl"><time data-slot-value="asOf.moment">placeholder</time></main>'
  expect(fillAsOfBindings(html, { date: '2026-11-14', zone: 'America/New_York', kind: 'current', moment: Date.parse('2026-11-14T13:00:00Z') })).toBe(
    '<main lang="he" dir="rtl"><time dir="ltr">2026-11-14T08:00:00-05:00</time></main>',
  )
  expect(fillAsOfBindings(html, { date: '2026-11-14', zone: 'America/New_York', kind: 'current' })).toBe(
    '<main lang="he" dir="rtl"><time dir="ltr"></time></main>',
  )
})

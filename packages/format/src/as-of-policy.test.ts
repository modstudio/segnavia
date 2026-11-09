import { describe, expect, test } from 'bun:test'
import { AsOf, CalendarDate, Zone } from './as-of.ts'
import { AsOfRefusedError, asOfRefusal, calendarDate, resolveAsOfDay } from './as-of-policy.ts'
import { BookShape } from './book.ts'
import { DeckShape } from './deck.ts'
import { jsonSchemas } from './json-schemas.ts'
import { Page } from './page.ts'

const boundaryMoment = Date.UTC(2026, 10, 14, 4, 30)

describe('as-of policy', () => {
  test('resolves fixed, current and anchor values', () => {
    expect(resolveAsOfDay({ kind: 'fixed', date: '2026-11-14' }, { moment: Number.NaN, hostZone: 'America/New_York' })).toEqual({
      kind: 'day',
      day: { date: '2026-11-14', zone: 'America/New_York', kind: 'fixed' },
    })
    expect(resolveAsOfDay({ kind: 'current' }, { moment: boundaryMoment, hostZone: 'America/New_York' })).toEqual({
      kind: 'day',
      day: { date: '2026-11-13', zone: 'America/New_York', kind: 'current' },
    })
    expect(resolveAsOfDay({ kind: 'anchor', anchor: 'coming-shabbos' }, { moment: boundaryMoment, hostZone: 'America/New_York' })).toEqual({
      kind: 'anchor',
      anchor: 'coming-shabbos',
      today: '2026-11-13',
    })
    expect(resolveAsOfDay(undefined, { moment: boundaryMoment, hostZone: 'America/New_York' })).toEqual({
      kind: 'day',
      day: { date: '2026-11-13', zone: 'America/New_York', kind: 'current' },
    })
  })

  test('takes the calendar date in the stated zone across a UTC boundary', () => {
    expect(calendarDate(boundaryMoment, 'America/New_York')).toBe('2026-11-13')
    expect(calendarDate(boundaryMoment, 'UTC')).toBe('2026-11-14')
  })

  test('uses the record zone, then the host zone, then UTC', () => {
    expect(resolveAsOfDay({ kind: 'fixed', date: '2026-11-14', zone: 'Europe/London' }, { moment: Number.NaN, hostZone: 'America/New_York' })).toEqual({
      kind: 'day',
      day: { date: '2026-11-14', zone: 'Europe/London', kind: 'fixed' },
    })
    expect(resolveAsOfDay({ kind: 'current' }, { moment: boundaryMoment, hostZone: 'America/New_York' })).toEqual({
      kind: 'day',
      day: { date: '2026-11-13', zone: 'America/New_York', kind: 'current' },
    })
    expect(resolveAsOfDay({ kind: 'fixed', date: '2026-11-14' }, { moment: Number.NaN })).toEqual({
      kind: 'day',
      day: { date: '2026-11-14', zone: 'UTC', kind: 'fixed' },
    })
  })

  test('refuses invalid zones and impossible dates', () => {
    expect(Zone.safeParse('Not/A_Zone').success).toBe(false)
    expect(CalendarDate.safeParse('2026-02-30').success).toBe(false)
    expect(AsOf.safeParse({ kind: 'fixed', date: '2026-02-30' }).success).toBe(false)
  })

  test('publishes the stored value schemas', () => {
    expect(jsonSchemas()).toMatchObject({
      calendarDate: { type: 'string', pattern: expect.any(String) },
      zone: { type: 'string' },
      asOf: { oneOf: expect.any(Array) },
    })
  })

  test('round-trips a page as-of value through parsing and JSON', () => {
    const asOf = { kind: 'fixed' as const, date: '2026-11-14' as const, zone: 'America/New_York' as const }
    const page = Page.parse({ html: '<p>Day</p>', asOf })
    expect(page.asOf).toEqual(asOf)
    expect(Page.parse(JSON.parse(JSON.stringify(page))).asOf).toEqual(asOf)
  })

  test('stores as-of values on books and decks', () => {
    expect(BookShape.parse({ title: 'Book', mode: 'continuous', asOf: { kind: 'anchor', anchor: 'coming-shabbos' } }).asOf).toEqual({
      kind: 'anchor',
      anchor: 'coming-shabbos',
    })
    expect(
      DeckShape.parse({ title: 'Deck', asOf: { kind: 'current', zone: 'UTC' }, slides: [{ id: 'one', content: { kind: 'html', html: '' } }] }).asOf,
    ).toEqual({ kind: 'current', zone: 'UTC' })
  })

  test('an anchor refusal names the anchor, reason and remedy', () => {
    const message = asOfRefusal('coming-shabbos', 'the host returned no date')
    expect(message).toContain('coming-shabbos')
    expect(message).toContain('the host returned no date')
    expect(message).toContain('to clear this refusal')
    expect(new AsOfRefusedError(message)).toMatchObject({ name: 'AsOfRefusedError', message })
  })
})

import { describe, expect, test } from 'bun:test'
import { AsOfRefusedError, asOfRefusal, calendarDate, resolveAsOfDay } from './as-of-policy.ts'

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
      zone: 'America/New_York',
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
    expect(resolveAsOfDay({ kind: 'current', zone: 'Europe/London' }, { moment: boundaryMoment, hostZone: 'America/New_York' })).toEqual({
      kind: 'day',
      day: { date: '2026-11-14', zone: 'Europe/London', kind: 'current' },
    })
    expect(resolveAsOfDay({ kind: 'fixed', date: '2026-11-14', zone: 'Europe/London' }, { moment: Number.NaN, hostZone: 'America/New_York' })).toEqual({
      kind: 'day',
      day: { date: '2026-11-14', zone: 'Europe/London', kind: 'fixed' },
    })
    expect(
      resolveAsOfDay({ kind: 'anchor', anchor: 'coming-shabbos', zone: 'Europe/London' }, { moment: boundaryMoment, hostZone: 'America/New_York' }),
    ).toEqual({
      kind: 'anchor',
      anchor: 'coming-shabbos',
      today: '2026-11-14',
      zone: 'Europe/London',
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

  test('an anchor refusal names the anchor, reason and remedy', () => {
    const message = asOfRefusal('coming-shabbos', 'the host returned no date')
    expect(message).toContain('coming-shabbos')
    expect(message).toContain('the host returned no date')
    expect(message).toContain('to clear this refusal')
    expect(new AsOfRefusedError(message)).toMatchObject({ name: 'AsOfRefusedError', message })
  })
})

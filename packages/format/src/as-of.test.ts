import { describe, expect, test } from 'bun:test'
import { AsOf, CalendarDate, Zone } from './as-of.ts'
import { jsonSchemas } from './json-schemas.ts'

describe('as-of values', () => {
  test('refuses invalid zones, impossible dates and empty anchor names', () => {
    expect(Zone.safeParse('Not/A_Zone').success).toBe(false)
    expect(CalendarDate.safeParse('2026-02-30').success).toBe(false)
    expect(AsOf.safeParse({ kind: 'fixed', date: '2026-02-30' }).success).toBe(false)
    expect(AsOf.safeParse({ kind: 'anchor', anchor: '' }).success).toBe(false)
  })

  test('publishes the stored value schemas', () => {
    expect(jsonSchemas()).toMatchObject({
      calendarDate: { type: 'string', pattern: expect.any(String) },
      zone: { type: 'string' },
      asOf: { oneOf: expect.any(Array) },
    })
  })
})

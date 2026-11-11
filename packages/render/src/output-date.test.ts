import { expect, test } from 'bun:test'
import type { AsOfDay } from '@segnavia/format'
import { isoDate, outputDate, pdfDate } from './output-date.ts'

const fixed: AsOfDay = { kind: 'fixed', date: '2026-11-14', zone: 'America/New_York' }
const anchor: AsOfDay = { kind: 'anchor', anchor: 'shabbos', date: '2026-11-14', zone: 'America/New_York' }
const current: AsOfDay = { kind: 'current', date: '2026-11-14', zone: 'America/New_York' }
const moment = Date.parse('2026-07-04T16:34:56Z')

test('selects an output date from exactly one resolved day', () => {
  expect(outputDate([{ ...current, moment }])).toEqual({ kind: 'instant', moment, zone: 'America/New_York' })
  expect(outputDate([{ ...anchor, moment }])).toEqual({ kind: 'instant', moment, zone: 'America/New_York' })
  expect(outputDate([fixed])).toEqual({ kind: 'date', date: '2026-11-14' })
  expect(outputDate([anchor])).toEqual({ kind: 'date', date: '2026-11-14' })
  expect(outputDate([current])).toBeUndefined()
  expect(outputDate([])).toBeUndefined()
  expect(outputDate([fixed, anchor])).toBeUndefined()
})

test('formats instant and date-only output dates', () => {
  const instant = outputDate([{ ...current, moment }])
  const date = outputDate([fixed])
  if (!instant || !date) throw new Error('Expected output dates')
  expect(isoDate(instant)).toBe('2026-07-04T12:34:56-04:00')
  expect(pdfDate(instant)).toBe("D:20260704123456-04'00'")
  expect(isoDate(date)).toBe('2026-11-14')
  expect(pdfDate(date)).toBe('D:20261114')
})

test('propagates the existing refusal for an out-of-range zoned year', () => {
  const date = { kind: 'instant', moment: Date.UTC(10_000, 0, 1), zone: 'UTC' } as const
  expect(() => isoDate(date)).toThrow('a year in the ISO 8601 range 0000 through 9999')
  expect(() => pdfDate(date)).toThrow('a year in the ISO 8601 range 0000 through 9999')
})

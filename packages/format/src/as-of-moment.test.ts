import { expect, test } from 'bun:test'
import { formatAsOfMoment } from './as-of-moment.ts'

test.each([
  ['New York in January', '2026-01-15T13:00:00Z', 'America/New_York', '2026-01-15T08:00:00-05:00'],
  ['New York in July', '2026-07-15T12:00:00Z', 'America/New_York', '2026-07-15T08:00:00-04:00'],
  ['Jerusalem', '2026-01-15T13:00:00Z', 'Asia/Jerusalem', '2026-01-15T15:00:00+02:00'],
  ['UTC', '2026-01-15T13:00:00Z', 'UTC', '2026-01-15T13:00:00+00:00'],
] as const)('formats an as-of moment in %s', (_case, input, zone, expected) => {
  expect(formatAsOfMoment(Date.parse(input), zone)).toBe(expected)
})

test('preserves nonzero milliseconds', () => {
  expect(formatAsOfMoment(Date.parse('2026-01-15T13:00:00.123Z'), 'UTC')).toBe('2026-01-15T13:00:00.123+00:00')
})

test('refuses a moment whose year cannot be written with four ISO digits', () => {
  expect(() => formatAsOfMoment(Date.parse('+010000-01-01T00:00:00Z'), 'UTC')).toThrow('year in the ISO 8601 range 0000 through 9999')
  expect(() => formatAsOfMoment(Date.parse('-000001-01-01T00:00:00Z'), 'UTC')).toThrow('supply a moment within that year range to clear this refusal')
})

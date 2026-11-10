import { describe, expect, test } from 'bun:test'
import { formatHebrewNumeral } from './numbering.ts'
import { HEBREW_MONTHS, libraryFormatDate, resolveDateVariables } from './date-format.ts'

describe('libraryFormatDate', () => {
  test.each([
    ['long', '2024-03-24', 'י״ד באדר ב׳ תשפ״ד'],
    ['short', '2024-03-24', 'י״ד אדר ב׳ תשפ״ד'],
    ['long', '2024-02-20', 'י״א באדר א׳ תשפ״ד'],
    ['long', '2023-03-01', 'ח׳ באדר תשפ״ג'],
  ] as const)('formats Hebrew-calendar %s %s independently of the host locale data', (format, date, expected) => {
    expect(libraryFormatDate({ date, calendar: 'hebrew', format, lang: 'he' })).toBe(expected)
  })

  test('keeps Intl output for English Hebrew-calendar and Hebrew Gregorian dates', () => {
    expect(libraryFormatDate({ date: '2024-03-24', calendar: 'hebrew', format: 'long', lang: 'en' })).toMatch(/14 Adar II 5784/)
    expect(libraryFormatDate({ date: '2024-03-24', calendar: 'gregorian', format: 'long', lang: 'he' })).toBe(
      new Intl.DateTimeFormat('he', { calendar: 'gregory', dateStyle: 'long', timeZone: 'UTC' }).format(new Date('2024-03-24T00:00:00Z')),
    )
  })

  test('covers every English ICU Hebrew month spelling in a leap and common year', () => {
    const names = new Set<string>()
    for (const year of [2023, 2024]) {
      for (let day = Date.UTC(year, 0, 1); day < Date.UTC(year + 1, 0, 1); day += 86_400_000) {
        const date = new Date(day)
        const name = new Intl.DateTimeFormat('en', { calendar: 'hebrew', month: 'long', timeZone: 'UTC' })
          .formatToParts(date)
          .find((part) => part.type === 'month')?.value
        if (name) names.add(name)
      }
    }
    expect([...names].filter((name) => !Object.hasOwn(HEBREW_MONTHS, name))).toEqual([])
  })

  test('formats values above and exactly on a Hebrew thousand', () => {
    expect(formatHebrewNumeral(10760, true)).toBe('תש״ס')
    expect(formatHebrewNumeral(6000, true)).toBe('ו׳')
  })
})

describe('resolveDateVariables', () => {
  const variables = [{ name: 'held', kind: 'date', date: '2024-03-24', calendar: 'hebrew', format: 'long' }] as const

  test('uses a host formatter once per date variable', () => {
    const requests: unknown[] = []
    expect(resolveDateVariables(variables, 'he', (request) => (requests.push(request), 'host date'))).toEqual({ held: 'host date' })
    expect(requests).toEqual([{ date: '2024-03-24', calendar: 'hebrew', format: 'long', lang: 'he' }])
  })

  test.each([
    ['throwing', () => { throw new Error('host failed') }],
    ['over-long', () => 'x'.repeat(257)],
  ])('refuses a %s host formatter and names the variable', (_name, formatter) => {
    expect(() => resolveDateVariables(variables, 'he', formatter)).toThrow('held')
    expect(() => resolveDateVariables(variables, 'he', formatter)).toThrow('formatDate')
  })
})

import { describe, expect, test } from 'bun:test'
import { variableValue } from './variable-value.ts'

const facts = (lang: string) => ({ numberingTotal: '', documentTotal: '', document: { lang, metadata: {} } })

describe('date variables', () => {
  test.each([
    ['long', '2024-03-24', 'י״ד באדר ב׳ תשפ״ד'],
    ['short', '2024-03-24', 'י״ד באדר ב׳ תשפ״ד'],
    ['long', '2024-02-23', 'י״ד באדר א׳ תשפ״ד'],
    ['short', '2024-02-23', 'י״ד באדר א׳ תשפ״ד'],
    ['long', '2024-02-24', 'ט״ו באדר א׳ תשפ״ד'],
    ['long', '2024-02-25', 'ט״ז באדר א׳ תשפ״ד'],
  ] as const)('formats a Hebrew-calendar %s date %s with printed Hebrew numerals', (format, date, expected) => {
    expect(variableValue({ name: 'date', kind: 'date', date, calendar: 'hebrew', format }, facts('he'))).toBe(expected)
  })

  test('keeps Intl digits for a Hebrew-calendar date in an English document', () => {
    expect(variableValue({ name: 'date', kind: 'date', date: '2024-03-24', calendar: 'hebrew', format: 'long' }, facts('en'))).toMatch(/14 Adar II 5784/)
  })
})

describe('meta variables', () => {
  const metadata = { title: 'Book', subject: 'Subject', authors: ['Ada', 'Ben', 'Cy'], extra: { edition: 'Second' } }

  test('resolves standard and declared extra metadata', () => {
    const held = { numberingTotal: '', documentTotal: '', document: { lang: 'en', metadata } }
    expect(variableValue({ name: 'title', kind: 'meta', field: 'title' }, held)).toBe('Book')
    expect(variableValue({ name: 'extra', kind: 'meta', field: 'edition' }, held)).toBe('Second')
    expect(variableValue({ name: 'authors', kind: 'meta', field: 'authors' }, held)).toBe('Ada, Ben, and Cy')
  })

  test('joins authors in Hebrew', () => {
    const held = { numberingTotal: '', documentTotal: '', document: { lang: 'he', metadata: { authors: ['אדה', 'בן', 'גל'] } } }
    expect(variableValue({ name: 'authors', kind: 'meta', field: 'authors' }, held)).toBe('אדה, בן וגל')
  })
})

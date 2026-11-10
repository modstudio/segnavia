import { describe, expect, test } from 'bun:test'
import { variableValue } from './variable-value.ts'

test('part-title variables ignore inherited names', () => {
  expect(
    variableValue(
      { name: 'part', kind: 'text', from: 'part-title', part: 'constructor', pick: 'first' },
      { numberingTotal: '', documentTotal: '', partTitles: {} },
    ),
  ).toBe('')
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

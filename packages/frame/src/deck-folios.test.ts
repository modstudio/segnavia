import { describe, expect, test } from 'bun:test'
import { deckFolioAt, deckFolios } from './deck-folios.ts'

describe('deck folios', () => {
  test('counts slides in Arabic and refuses a missing index', () => {
    const folios = deckFolios({ slides: [{}, {}, {}] })
    expect(folios.map((folio) => folio.text)).toEqual(['1', '2', '3'])
    expect(deckFolioAt(folios, 1)).toEqual({ number: 2, text: '2' })
    expect(() => deckFolioAt(folios, 3)).toThrow('Slide 3 has no computed folio.')
  })
})

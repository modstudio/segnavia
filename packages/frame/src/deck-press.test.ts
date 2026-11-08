import { expect, test } from 'bun:test'
import { deckPressSettings } from './deck-press.ts'

test('a sheet accepts only press fields and cannot replace the deck trim', () => {
  expect(() => deckPressSettings({ width: 400, height: 200 }, { sheet: { paper: 'a4', bleed: 3 } as never })).toThrow('Correct sheet.paper, or remove sheet')
})

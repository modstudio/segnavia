import { expect, test } from 'bun:test'
import { deckPressSettings } from './deck-press.ts'

test('the removed sheet option names the deck Document print replacement', () => {
  const deck = { title: 'Deck', size: { width: 400, height: 200 }, slides: [] } as never
  expect(() => deckPressSettings(deck, { sheet: { bleed: 3 } })).toThrow("deck Document's print")
})

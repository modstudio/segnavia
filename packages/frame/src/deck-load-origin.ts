import type { Deck } from '@segnavia/format'

const internalInputs = new WeakSet<object>()
const internalDecks = new WeakSet<Deck>()

export function markInternalDeckInput(input: object) {
  internalInputs.add(input)
}

export function takeInternalDeckInput(input: unknown): boolean {
  return typeof input === 'object' && input !== null && internalInputs.delete(input)
}

export function inheritDeckLoadOrigin(internal: boolean, deck: Deck) {
  if (!internal) return
  internalDecks.add(deck)
}

export function isInternalDeck(deck: Deck): boolean {
  return internalDecks.has(deck)
}

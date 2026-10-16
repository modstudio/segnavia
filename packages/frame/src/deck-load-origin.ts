import { Deck } from '@segnavia/format'

const internalInputs = new WeakSet<object>()
const internalDecks = new WeakSet<Deck>()
const preservedLoads = new WeakMap<Promise<void>, Set<string>>()
const preservedDecks = new WeakMap<Deck, Set<string>>()

export function markInternalDeckInput(input: object) {
  internalInputs.add(input)
}

export function preserveNotesForLoad(load: Promise<void>, slideId: string) {
  const slides = preservedLoads.get(load) ?? new Set<string>()
  slides.add(slideId)
  preservedLoads.set(load, slides)
}

export function parseDeckLoad(input: unknown, load?: Promise<void>): Deck {
  const internal = typeof input === 'object' && input !== null && internalInputs.delete(input)
  const deck = Deck.parse(input)
  if (internal) internalDecks.add(deck)
  const preserved = load && preservedLoads.get(load)
  if (preserved) preservedDecks.set(deck, preserved)
  return deck
}

export function isInternalDeck(deck: Deck): boolean {
  return internalDecks.has(deck)
}

export function deckPreservesNotes(deck: Deck, slideId: string): boolean {
  return preservedDecks.get(deck)?.has(slideId) ?? false
}

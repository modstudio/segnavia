import { Deck } from '@segnavia/format'

const registryKey = Symbol.for('@segnavia/frame/deck-load-origin-registry')
export const internalDeckLoad = Symbol('internal-deck-load')

interface DeckLoadOriginRegistry {
  internalDecks: WeakSet<Deck>
  preservedByLoad: WeakMap<Promise<void>, Set<string>>
  preservedByDeck: WeakMap<Deck, Set<string>>
}

function registry(): DeckLoadOriginRegistry {
  const scope = globalThis as typeof globalThis & Record<symbol, DeckLoadOriginRegistry | undefined>
  const existing = scope[registryKey]
  if (existing) return existing
  const created: DeckLoadOriginRegistry = {
    internalDecks: new WeakSet(),
    preservedByLoad: new WeakMap(),
    preservedByDeck: new WeakMap(),
  }
  scope[registryKey] = created
  return created
}

export function preserveNotesForLoad(load: Promise<void>, slideId: string) {
  const origins = registry()
  const slides = origins.preservedByLoad.get(load) ?? new Set<string>()
  slides.add(slideId)
  origins.preservedByLoad.set(load, slides)
}

export function parseDeckLoad(input: unknown, load?: Promise<void>, internal = false): Deck {
  const deck = Deck.parse(input)
  const origins = registry()
  if (internal) origins.internalDecks.add(deck)
  const preserved = load && origins.preservedByLoad.get(load)
  if (preserved) origins.preservedByDeck.set(deck, preserved)
  return deck
}

export function isInternalDeck(deck: Deck): boolean {
  return registry().internalDecks.has(deck)
}

export function deckPreservesNotes(deck: Deck, slideId: string): boolean {
  return registry().preservedByDeck.get(deck)?.has(slideId) ?? false
}

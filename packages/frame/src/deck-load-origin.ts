import { type BrandSource, Deck, deckFromDocument, resolveBrand } from '@segnavia/format'
import { parseDocument } from '@segnavia/html'

const registryKey = Symbol.for('@segnavia/frame/deck-load-origin-registry')
export const internalDeckLoad = Symbol.for('@segnavia/frame/internal-deck-load-method')

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

function recordDeckLoad(deck: Deck, load: Promise<void> | undefined, internal: boolean): Deck {
  const origins = registry()
  if (internal) origins.internalDecks.add(deck)
  const preserved = load && origins.preservedByLoad.get(load)
  if (preserved) origins.preservedByDeck.set(deck, preserved)
  return deck
}

export function parseDeckLoad(input: unknown, load?: Promise<void>, internal = false): Deck {
  const deck = internal ? Deck.parse(input) : deckFromDocument(parseDocument(input))
  return recordDeckLoad(deck, load, internal)
}

export async function resolveDeckLoad(
  input: unknown,
  source: BrandSource | undefined,
  signal: AbortSignal,
  load?: Promise<void>,
  internal = false,
): Promise<Deck> {
  if (internal) return parseDeckLoad(input, load, true)
  const document = parseDocument(input)
  return recordDeckLoad(deckFromDocument(document, await resolveBrand(document, source, signal)), load, false)
}

export function isInternalDeck(deck: Deck): boolean {
  return registry().internalDecks.has(deck)
}

export function deckPreservesNotes(deck: Deck, slideId: string): boolean {
  return registry().preservedByDeck.get(deck)?.has(slideId) ?? false
}

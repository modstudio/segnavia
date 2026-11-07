import { Deck, deckFromDocument } from '@segnavia/format'
import { parseDocument } from '@segnavia/html'
import type { ResolvedContent } from './controller-types.ts'

const registryKey = Symbol.for('@segnavia/frame/deck-load-origin-registry')
export const internalDeckLoad = Symbol.for('@segnavia/frame/internal-deck-load-method')

interface DeckLoadOriginRegistry {
  internalDecks: WeakSet<Deck>
  preservedByLoad: WeakMap<Promise<void>, Set<string>>
  preservedByDeck: WeakMap<Deck, Set<string>>
  authoredHtml: WeakMap<object, string>
}

function registry(): DeckLoadOriginRegistry {
  const scope = globalThis as typeof globalThis & Record<symbol, DeckLoadOriginRegistry | undefined>
  const existing = scope[registryKey]
  if (existing) return existing
  const created: DeckLoadOriginRegistry = {
    internalDecks: new WeakSet(),
    preservedByLoad: new WeakMap(),
    preservedByDeck: new WeakMap(),
    authoredHtml: new WeakMap(),
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
  const deck = internal ? Deck.parse(input) : deckFromDocument(parseDocument(input))
  const origins = registry()
  if (internal) origins.internalDecks.add(deck)
  if (!internal && typeof input === 'object' && input !== null && 'children' in input && Array.isArray(input.children)) {
    const raw = new Map<string, string>()
    for (const node of input.children) {
      if (typeof node !== 'object' || node === null || !('id' in node) || typeof node.id !== 'string' || !('content' in node)) continue
      const content = node.content
      if (typeof content === 'object' && content !== null && 'kind' in content && content.kind === 'html' && 'html' in content && typeof content.html === 'string') {
        raw.set(node.id, content.html)
      }
    }
    for (const slide of deck.slides) {
      const html = raw.get(slide.id)
      if (html !== undefined && 'kind' in slide.content && slide.content.kind === 'html') origins.authoredHtml.set(slide.content, html)
    }
  }
  const preserved = load && origins.preservedByLoad.get(load)
  if (preserved) origins.preservedByDeck.set(deck, preserved)
  return deck
}

export function contentForComparison(content: ResolvedContent): ResolvedContent {
  const html = registry().authoredHtml.get(content)
  return html === undefined || content.kind !== 'html' ? content : { ...content, html }
}

export function isInternalDeck(deck: Deck): boolean {
  return registry().internalDecks.has(deck)
}

export function deckPreservesNotes(deck: Deck, slideId: string): boolean {
  return registry().preservedByDeck.get(deck)?.has(slideId) ?? false
}

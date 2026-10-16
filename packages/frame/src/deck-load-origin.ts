import { Deck } from '@segnavia/format'

const internalInputKey = Symbol.for('@segnavia/frame/internal-deck-input')
const internalDeckKey = Symbol.for('@segnavia/frame/internal-deck')
const preservedNotesKey = Symbol.for('@segnavia/frame/preserved-deck-notes')

type Tagged = Record<symbol, unknown>

function tag(target: object, key: symbol, value: unknown) {
  Object.defineProperty(target, key, { configurable: true, value })
}

export function markInternalDeckInput(input: object) {
  tag(input, internalInputKey, true)
}

export function preserveNotesForLoad(load: Promise<void>, slideId: string) {
  const tagged = load as Promise<void> & Tagged
  const slides = (tagged[preservedNotesKey] as Set<string> | undefined) ?? new Set<string>()
  slides.add(slideId)
  tag(load, preservedNotesKey, slides)
}

export function parseDeckLoad(input: unknown, load?: Promise<void>): Deck {
  const taggedInput = typeof input === 'object' && input !== null ? (input as Tagged) : null
  const internal = taggedInput?.[internalInputKey] === true
  if (taggedInput) delete taggedInput[internalInputKey]
  const deck = Deck.parse(input)
  if (internal) tag(deck, internalDeckKey, true)
  const preserved = load && ((load as Promise<void> & Tagged)[preservedNotesKey] as Set<string> | undefined)
  if (preserved) tag(deck, preservedNotesKey, preserved)
  return deck
}

export function isInternalDeck(deck: Deck): boolean {
  return (deck as Deck & Tagged)[internalDeckKey] === true
}

export function deckPreservesNotes(deck: Deck, slideId: string): boolean {
  return ((deck as Deck & Tagged)[preservedNotesKey] as Set<string> | undefined)?.has(slideId) ?? false
}

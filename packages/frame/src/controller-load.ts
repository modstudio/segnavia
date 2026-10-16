import { type Deck, resolveDirection } from '@segnavia/format'
import { playerOptionState } from './controller-options.ts'
import type { ControllerOptions, DeckState } from './controller-types.ts'
import { indexAfterReload } from './deck-window.ts'
import { deckTimeline } from './timeline.ts'

export function stateForDeckLoad(current: DeckState, deck: Deck, captionsVisible: boolean, options: ControllerOptions, hashIndex: number | null) {
  const wasOpen = current.deck !== null
  const oldIds = current.deck?.slides.map((slide) => slide.id) ?? []
  const selectedId = current.slide?.id ?? null
  const index = wasOpen
    ? indexAfterReload(
        oldIds,
        deck.slides.map((slide) => slide.id),
        selectedId,
      )
    : (hashIndex ?? 0)
  return {
    ...playerOptionState(deck, captionsVisible, options),
    deck,
    direction: resolveDirection(deck.dir, deck.lang, deck.title),
    playing: false,
    index,
    totalMs: deckTimeline(deck).totalMs,
  }
}

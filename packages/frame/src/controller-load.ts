import { type Deck, resolveDirection } from '@segnavia/format'
import { playerOptionState } from './controller-options.ts'
import type { ControllerOptions, DeckState } from './controller-types.ts'
import { indexAfterReload } from './deck-window.ts'
import type { SeekPolicy } from './navigation-limit.ts'
import { deckTimeline } from './timeline.ts'

export function stateForDeckLoad(
  current: DeckState,
  deck: Deck,
  captionsVisible: boolean,
  options: ControllerOptions,
  hashIndex: number | null,
  seededReach: number,
  editionReplay: boolean,
  seeded: boolean,
) {
  const wasOpen = current.deck !== null
  const oldIds = current.deck?.slides.map((slide) => slide.id) ?? []
  const selectedId = current.slide?.id ?? null
  const reloadedIndex = wasOpen
    ? indexAfterReload(
        oldIds,
        deck.slides.map((slide) => slide.id),
        selectedId,
      )
    : (hashIndex ?? 0)
  const seek: SeekPolicy = options.seek ?? 'free'
  const index = !editionReplay && seeded && seek === 'furthest' ? (hashIndex ?? Math.min(seededReach, deck.slides.length - 1)) : reloadedIndex
  return {
    ...playerOptionState(deck, captionsVisible, options),
    deck,
    direction: resolveDirection(deck.dir, deck.lang, deck.title),
    playing: false,
    index,
    slide: deck.slides[index] ?? null,
    content: null,
    totalMs: deckTimeline(deck).totalMs,
  }
}

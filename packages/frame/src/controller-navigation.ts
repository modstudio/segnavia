import type { Deck } from '@segnavia/format'
import type { DeckController, ResolvedContent } from './controller.ts'
import { neighborWindow } from './deck-window.ts'

export function slideIndexById(deck: Deck, id: string): number | undefined {
  const index = deck.slides.findIndex((slide) => slide.id === id)
  return index === -1 ? undefined : index
}

export function prefetchControllerNeighbors(
  enabled: boolean | undefined,
  deck: Deck | null,
  index: number,
  contentFor: (index: number) => Promise<ResolvedContent>,
) {
  if (!enabled || !deck) return
  for (const neighbor of neighborWindow(index, deck.slides.length)) {
    if (neighbor !== index) void contentFor(neighbor)
  }
}

export function syncControllerHash(controller: DeckController, index: number | null) {
  if (index !== null && index !== controller.state.index) void controller.go(index).catch(() => {})
}

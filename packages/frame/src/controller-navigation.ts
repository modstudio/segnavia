import type { Deck } from '@segnavia/format'
import type { DeckController, ResolvedContent } from './controller.ts'
import { hashSlideIndex, neighborWindow } from './deck-window.ts'
import { limitNavigation, type SeekPolicy, slideRequest } from './navigation-limit.ts'
import { hasWindow } from './schedule.ts'
import type { Position } from './watched.ts'

export function slideIndexById(deck: Deck, id: string): number | undefined {
  const index = deck.slides.findIndex((slide) => slide.id === id)
  return index === -1 ? undefined : index
}

export async function goControllerToSlide(controller: DeckController, id: string): Promise<boolean> {
  const index = controller.state.deck ? slideIndexById(controller.state.deck, id) : undefined
  if (index === undefined) return false
  await controller.go(index)
  return controller.state.slide?.id === id
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

export function syncControllerHash(controller: DeckController, index: number | null, allowed = true, restore: () => void = () => {}) {
  if (index === null || index === controller.state.index) return
  if (!allowed) return restore()
  void controller.go(index).catch(() => {})
}

export function controllerHashIndex(deck: Deck, prefix: string | null | undefined): number | null {
  return hasWindow && prefix ? hashSlideIndex(location.hash, prefix, deck.slides.length) : null
}

export function writeControllerHash(prefix: string | null | undefined, index: number) {
  if (hasWindow && prefix) history.replaceState(null, '', `#${prefix}${index + 1}`)
}

export function handleControllerHash(controller: DeckController, deck: Deck | null, prefix: string | null | undefined, policy: SeekPolicy, reach: Position) {
  const index = deck ? controllerHashIndex(deck, prefix) : null
  const allowed = index === null || limitNavigation(policy, reach, slideRequest(index)) !== null
  syncControllerHash(controller, index, allowed, () => writeControllerHash(prefix, controller.state.index))
}

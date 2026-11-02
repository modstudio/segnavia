import type { Deck } from '@segnavia/format'
import type { ControllerOptions, ResolvedContent } from './controller-types.ts'

export function setPlacementOptions(
  options: ControllerOptions,
  value: ControllerOptions['placements'],
  deck: Deck | null,
  prefetched: Map<string, Promise<ResolvedContent>>,
): boolean {
  options.placements = value
  if (!deck) return false
  for (const slide of deck.slides) if ('media' in slide.content) prefetched.delete(slide.id)
  return true
}

export function replacePlacementLifetime(current: AbortController): AbortController {
  current.abort()
  return new AbortController()
}

import type { Deck } from '@segnavia/format'
import type { ControllerPlayback } from './controller-playback.ts'
import { slideDurationMs } from './timeline.ts'
import type { WatchedSeed } from './watched-seed.ts'

export function resetControllerWatched(playback: ControllerPlayback, deck: Deck, index: number, seed: WatchedSeed | undefined) {
  return playback.resetWatched(
    deck.slides.map((slide) => ({ id: slide.id, durationMs: slideDurationMs(slide, deck) })),
    { index, ms: 0 },
    seed,
  )
}

export function seededStartIndex(
  loadedIndex: number,
  slideCount: number,
  wasOpen: boolean,
  hashIndex: number | null,
  seek: 'free' | 'furthest',
  seededReach: number,
  seed: WatchedSeed | undefined,
): number {
  return !wasOpen && hashIndex === null && seek === 'furthest' && seed ? Math.min(seededReach, slideCount - 1) : loadedIndex
}

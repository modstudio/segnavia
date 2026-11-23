import type { Deck } from '@segnavia/format'
import type { ControllerPlayback } from './controller-playback.ts'
import { slideDurationMs } from './timeline.ts'
import type { WatchedSeed } from './watched-seed.ts'

export function resetControllerWatched(playback: ControllerPlayback, deck: Deck, seed: WatchedSeed | undefined) {
  return playback.resetWatched(
    deck.slides.map((slide) => ({ id: slide.id, durationMs: slideDurationMs(slide, deck) })),
    { index: 0, ms: 0 },
    seed,
  )
}

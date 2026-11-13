import type { DeckController, DeckState } from './controller.ts'
import { slideIndexById } from './controller-navigation.ts'
import type { FramePool } from './frame-pool.ts'
import { SlideFrameError } from './slide-frame-error.ts'

export function shownFrameRefusal(pool: Pick<FramePool, 'failureFor'>, state: DeckState): SlideFrameError | null {
  const failure = pool.failureFor(state)
  return failure instanceof SlideFrameError ? failure : null
}

export function recordFrameRefusal(pool: Pick<FramePool, 'markFailed'>, controller: DeckController | null, slideId: string, cause: unknown): SlideFrameError {
  const errorCause = cause instanceof Error ? cause : new Error(String(cause))
  const deck = controller?.state.deck
  const index = (deck && slideIndexById(deck, slideId)) ?? -1
  const error = new SlideFrameError(slideId, index, errorCause)
  pool.markFailed(slideId, error)
  return error
}

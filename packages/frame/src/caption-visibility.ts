import type { DeckState } from './controller-types.ts'

export function captionHasContent(state: Pick<DeckState, 'slide' | 'captionsVisible'>): boolean {
  return Boolean(state.captionsVisible && state.slide?.narration)
}

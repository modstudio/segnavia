import type { Deck } from '@segnavia/format'
import { deckHasNarration, deckPlayable, trackReach } from './control-values.ts'
import type { DeckState } from './controller-types.ts'
import type { PlaybackState } from './playback.ts'
import { deckTimeline } from './timeline.ts'

export class DeckPlaybackState {
  private source: DeckState | null = null
  private value: (DeckState & PlaybackState) | null = null
  private deck: Deck | null = null
  private timeline = deckTimeline({ slides: [] })

  read(state: DeckState): DeckState & PlaybackState {
    if (this.source === state && this.value) return this.value
    if (this.deck !== state.deck) {
      this.deck = state.deck
      this.timeline = state.deck ? deckTimeline(state.deck) : deckTimeline({ slides: [] })
    }
    this.source = state
    this.value = {
      ...state,
      timeline: this.timeline,
      playable: deckPlayable(state),
      audible: deckHasNarration(state),
      reach: trackReach(state),
    }
    return this.value
  }
}

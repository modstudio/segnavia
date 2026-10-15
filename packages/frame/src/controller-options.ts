import type { Deck } from '@segnavia/format'
import type { ControllerOptions, DeckState } from './controller-types.ts'

type PlayerOptions = Pick<ControllerOptions, 'playback' | 'captions'>

export function playerOptionState(deck: Deck, captionsVisible: boolean, options: PlayerOptions): Pick<DeckState, 'playback' | 'captionsVisible'> {
  const captions = options.captions ?? deck.captions ?? 'viewer'
  return {
    playback: options.playback ?? deck.playback ?? 'step',
    captionsVisible: captions === 'on' ? true : captions === 'off' ? false : captionsVisible,
  }
}

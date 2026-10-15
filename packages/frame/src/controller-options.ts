import type { Deck } from '@segnavia/format'
import type { ControllerOptions, DeckState } from './controller-types.ts'

type PlayerOptions = Pick<ControllerOptions, 'playback' | 'captions'>

export function captionsPolicy(deck: Deck | null, options: PlayerOptions): 'on' | 'off' | 'viewer' {
  return options.captions ?? deck?.captions ?? 'viewer'
}

export function playerOptionState(deck: Deck, captionsVisible: boolean, options: PlayerOptions): Pick<DeckState, 'playback' | 'captionsVisible'> {
  const captions = captionsPolicy(deck, options)
  return {
    playback: options.playback ?? deck.playback ?? 'step',
    captionsVisible: captions === 'on' ? true : captions === 'off' ? false : captionsVisible,
  }
}

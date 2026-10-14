import { DEFAULT_TRANSITION_DURATION_MS, type Deck, resolveDirection, type Slide, type Transition } from '@segnavia/format'
import type { AttributeTransition } from './transition-option.ts'

export type TurnDirection = 'forward' | 'back'
export type TransitionAxis = 'left' | 'right'
export type HostTransition = Transition | AttributeTransition | 'none'

export interface TurnTransition {
  kind: Transition['kind']
  duration: number
  axis: TransitionAxis
}

export interface TransitionInputs {
  deck: Deck
  from: Slide
  to: Slide
  direction: TurnDirection
  hostOverride?: HostTransition
  reducedMotion: boolean
}

/**
 * Chooses all motion for one turn. A future per-slide setting changes only
 * this function and the format schema.
 */
export function transitionFor({ deck, from: _from, to: _to, direction, hostOverride, reducedMotion }: TransitionInputs): TurnTransition {
  const readingDirection = resolveDirection(deck.dir, deck.lang, deck.title)
  const axis = direction === 'forward' ? (readingDirection === 'ltr' ? 'right' : 'left') : readingDirection === 'ltr' ? 'left' : 'right'
  const selected =
    hostOverride === 'none'
      ? { kind: 'none' as const, duration: 0 }
      : {
          kind: hostOverride?.kind ?? deck.transition?.kind ?? 'none',
          duration: hostOverride?.duration ?? deck.transition?.duration ?? DEFAULT_TRANSITION_DURATION_MS,
        }
  if (reducedMotion || selected.kind === 'none') return { kind: 'none', duration: 0, axis }
  return { ...selected, axis }
}

import type { Deck, Shot, SlideContent } from '@segnavia/format'
import type { ControllerOptions, DeckState, ResolvedContent } from './controller-types.ts'

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

type ResolvedShot = Extract<ResolvedContent, { kind: 'shot' }>
type ShotReference = Extract<SlideContent, { kind: 'shot-ref' }>

export function referenceOverrides(content: ResolvedShot, reference: ShotReference): ResolvedShot {
  return {
    ...content,
    ...(reference.fit ? { fit: reference.fit } : {}),
    ...(reference.frame !== undefined ? { frame: reference.frame } : {}),
  }
}

export function resolvedPublishedShot(src: string, shot: Shot, reference: ShotReference): ResolvedShot {
  return referenceOverrides({ kind: 'shot', src, shot }, reference)
}

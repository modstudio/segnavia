import { type Deck, parsePlayback, type Shot, type SlideContent } from '@segnavia/format'
import type { ControllerOptions, DeckState, ResolvedContent } from './controller-types.ts'

export type PlayerOptions = Pick<ControllerOptions, 'playback' | 'captions' | 'seek'>
// Seek is set by the host, not by an attribute.
export type PlayerAttributeOptions = Pick<ControllerOptions, 'playback' | 'captions'>

export function playerAttributeOptions(player: HTMLElement): PlayerAttributeOptions {
  const playback = player.getAttribute('playback')
  const captions = player.getAttribute('captions')
  return {
    playback: parsePlayback(playback),
    captions: captions === 'on' || captions === 'off' || captions === 'viewer' ? captions : undefined,
  }
}

export function captionsPolicy(deck: Deck | null, options: PlayerOptions): 'on' | 'off' | 'viewer' {
  return options.captions ?? deck?.captions ?? 'viewer'
}

export function playerOptionState(deck: Deck, captionsVisible: boolean, options: PlayerOptions): Pick<DeckState, 'playback' | 'captionsVisible' | 'seek'> {
  const captions = captionsPolicy(deck, options)
  return {
    playback: options.playback ?? deck.playback ?? 'segmented',
    captionsVisible: captions === 'on' ? true : captions === 'off' ? false : captionsVisible,
    seek: options.seek ?? 'free',
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

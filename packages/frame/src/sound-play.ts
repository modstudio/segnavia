import type { ResolvedSoundPlacement, SoundPlacements } from '@segnavia/html'
import { type FrameMessage, MESSAGE } from './bridge.ts'

export interface SoundPlayDetail extends ResolvedSoundPlacement {
  placement: string
}

const SOUND_PLAY_EVENT = 'segnavia-sound-play'

export function raiseSoundPlay(target: EventTarget, resolved: ResolvedSoundPlacement, placement: string): void {
  const detail: SoundPlayDetail = { ...resolved, placement }
  target.dispatchEvent(new CustomEvent<SoundPlayDetail>(SOUND_PLAY_EVENT, { detail, bubbles: true, composed: true, cancelable: true }))
}

export function dispatchSoundPlay(target: EventTarget, message: FrameMessage | null, sounds: Readonly<SoundPlacements> | undefined): boolean {
  if (message?.type !== MESSAGE.soundPlay || message.placement === undefined) return false
  const resolved = sounds?.get(message.placement)
  if (!resolved) return false
  raiseSoundPlay(target, resolved, message.placement)
  return true
}

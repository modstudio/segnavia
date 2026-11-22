import type { Sound } from '@segnavia/format'
import type { ResolvedSoundPlacement } from '@segnavia/html'
import { type FrameMessage, MESSAGE } from './bridge.ts'

export interface SoundPlayDetail extends ResolvedSoundPlacement {
  placement: string
}

export function dispatchSoundPlay(target: EventTarget, message: FrameMessage | null, sounds: ReadonlyMap<string, ResolvedSoundPlacement> | undefined): boolean {
  if (message?.type !== MESSAGE.soundPlay || message.placement === undefined) return false
  const resolved = sounds?.get(message.placement)
  if (!resolved) return false
  const detail: SoundPlayDetail = { ...resolved, placement: message.placement }
  target.dispatchEvent(new CustomEvent<SoundPlayDetail>('segnavia-sound-play', { detail, bubbles: true, composed: true, cancelable: true }))
  return true
}

export function soundPlayDetail(sound: Sound, src: string, placement: string): SoundPlayDetail {
  return { sound, src, placement }
}

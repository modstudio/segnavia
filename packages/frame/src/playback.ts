import type { Deck, PlaybackMode, TextDirection } from '@segnavia/format'
import type { DeckTimeline } from './timeline.ts'

export interface PlaybackState {
  deck?: Deck | null
  index: number
  direction: TextDirection
  playing: boolean
  muted: boolean
  elapsedMs: number
  totalMs: number
  playback: PlaybackMode
  progress: number
  timeline: DeckTimeline
  playable: boolean
  audible: boolean
  reach: number
}

export interface Playback extends EventTarget {
  readonly state: PlaybackState
  play(): Promise<void>
  pause(): void
  toggle(): Promise<void> | void
  setMuted(muted: boolean): void
  seek(ms: number): Promise<void>
}

import type { Deck } from '@segnavia/format'
import type { DeckState } from './controller-types.ts'
import type { DeckTimeline } from './timeline.ts'

type SharedPlaybackState = Pick<DeckState, 'index' | 'direction' | 'playing' | 'muted' | 'elapsedMs' | 'totalMs' | 'playback' | 'progress'>

export interface PlaybackState extends SharedPlaybackState {
  deck?: Deck | null
  timeline: DeckTimeline
  playable: boolean
  audible: boolean
  reach: number
  lockedFrom: number
}

export interface Playback extends EventTarget {
  readonly state: PlaybackState
  play(): Promise<void>
  pause(): void
  toggle(): Promise<void> | void
  setMuted(muted: boolean): void
  seek(ms: number): Promise<void>
}

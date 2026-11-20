import type { DeckState } from './controller-types.ts'

export type PlaybackState = Pick<DeckState, 'playing' | 'muted' | 'elapsedMs' | 'totalMs' | 'direction' | 'playback' | 'progress'> &
  Partial<Pick<DeckState, 'deck' | 'index' | 'seek' | 'watched'>>

export interface Playback extends EventTarget {
  readonly kind?: 'sound'
  readonly state: PlaybackState
  play(): Promise<void>
  pause(): void
  toggle(): Promise<void> | void
  setMuted(muted: boolean): void
  seek(ms: number): Promise<void>
  go?(index: number): Promise<void>
}

export function playbackAvailable(state: PlaybackState): boolean {
  return state.totalMs > 0
}

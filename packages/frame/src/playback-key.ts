import type { PlaybackState } from './playback.ts'

export function playbackKeyTarget(key: string, state: PlaybackState): number | null {
  if (key === 'Home') return 0
  if (key === 'End') return state.totalMs
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null
  const forward = key === 'ArrowRight' ? state.direction === 'ltr' : state.direction === 'rtl'
  return state.elapsedMs + (forward ? 5000 : -5000)
}

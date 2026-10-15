import type { DeckState } from './controller-types.ts'
import { slideDurationMs } from './timeline.ts'

export function formatTime(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  const rest = String(seconds % 60).padStart(2, '0')
  if (minutes < 60) return `${minutes}:${rest}`
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${rest}`
}

export function deckHasNarration(state: Pick<DeckState, 'deck'>): boolean {
  return state.deck?.slides.some((slide) => slide.narration !== undefined) ?? false
}

export function timeValues(state: DeckState): { elapsedMs: number; totalMs: number } | null {
  if (state.playback === 'continuous') {
    const timed = state.deck?.slides.some((slide) => slideDurationMs(slide) !== null) ?? false
    return timed ? { elapsedMs: state.elapsedMs, totalMs: state.totalMs } : null
  }
  const totalMs = state.slide ? slideDurationMs(state.slide) : null
  return totalMs === null ? null : { elapsedMs: state.slideElapsedMs, totalMs }
}

export function captionsControlVisible(state: Pick<DeckState, 'deck'>, policy: 'on' | 'off' | 'viewer'): boolean {
  return policy === 'viewer' && deckHasNarration(state)
}

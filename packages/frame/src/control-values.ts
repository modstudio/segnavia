import type { DeckState } from './controller-types.ts'
import { deckTimeline, slideDurationMs } from './timeline.ts'
import { limitNavigation } from './watched.ts'

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

// Play advances on durations; a deck where no slide has one has nothing to play.
export function deckPlayable(state: Pick<DeckState, 'deck'>): boolean {
  return state.deck?.slides.some((slide) => slideDurationMs(slide) !== null) ?? false
}

// Playback runs through the deck in both modes, so the time is the deck's.
// Step and continuous differ in how the track draws progress, not the clock.
export function timeValues(state: DeckState): { elapsedMs: number; totalMs: number } | null {
  return deckPlayable(state) ? { elapsedMs: state.elapsedMs, totalMs: state.totalMs } : null
}

export function captionsControlVisible(state: Pick<DeckState, 'deck'>, policy: 'on' | 'off' | 'viewer'): boolean {
  return policy === 'viewer' && deckHasNarration(state)
}

type NavigationState = Pick<DeckState, 'deck' | 'index' | 'playback' | 'seek' | 'totalMs' | 'watched'>

export function stepForwardDisabled(state: NavigationState): boolean {
  return limitNavigation(state.seek, state.watched.reach, { kind: 'slide', to: { index: state.index + 1, ms: 0 } }) === null
}

export function trackSegmentLocked(state: Pick<NavigationState, 'seek' | 'watched'>, index: number): boolean {
  return limitNavigation(state.seek, state.watched.reach, { kind: 'slide', to: { index, ms: 0 } }) === null
}

export function trackSegmentState(state: Pick<NavigationState, 'seek' | 'watched'>, index: number, current: number) {
  if (trackSegmentLocked(state, index)) return 'locked'
  if (index < current) return 'done'
  return index === current ? 'current' : 'upcoming'
}

export function trackReach(state: NavigationState): number {
  const slides = state.deck?.slides ?? []
  const reach = state.watched.reach
  if (state.seek === 'free' || reach.index >= slides.length) return 1
  if (state.playback === 'continuous') {
    if (state.totalMs === 0) return slides.length === 0 ? 1 : reach.index / slides.length
    const startMs = deckTimeline({ slides }).slides[reach.index]?.startMs ?? state.totalMs
    return (startMs + reach.ms) / state.totalMs
  }
  const reachSlide = slides[reach.index]
  const durationMs = reachSlide ? slideDurationMs(reachSlide) : null
  const slideProgress = durationMs && durationMs > 0 ? reach.ms / durationMs : 0
  return slides.length === 0 ? 1 : (reach.index + slideProgress) / slides.length
}

import type { DeckState } from './controller-types.ts'

export function emitControllerState(target: EventTarget, state: DeckState, lastCue: string): string {
  target.dispatchEvent(new CustomEvent('change', { detail: state }))
  const cue = state.shown === null ? 'all' : state.shown.join(',')
  if (cue !== lastCue) target.dispatchEvent(new CustomEvent('cue', { detail: { annotations: state.shown } }))
  return cue
}

export function emitControllerComplete(target: EventTarget, state: DeckState, emitted: boolean): boolean {
  if (emitted || !state.watched.complete) return emitted
  target.dispatchEvent(new CustomEvent('complete', { detail: { watchedMs: state.watched.ms, share: state.watched.share } }))
  return true
}

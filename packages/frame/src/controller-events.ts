import type { DeckState } from './controller-types.ts'
import { cueKey } from './cue-key.ts'

export function emitControllerState(target: EventTarget, state: DeckState, lastCue: string | undefined): string {
  target.dispatchEvent(new CustomEvent('change', { detail: state }))
  const cue = cueKey(state.shown)
  if (cue !== lastCue) target.dispatchEvent(new CustomEvent('cue', { detail: { annotations: state.shown } }))
  return cue
}

export function emitControllerComplete(target: EventTarget, state: DeckState, emitted: boolean): boolean {
  if (emitted || !state.watched.complete) return emitted
  target.dispatchEvent(new CustomEvent('complete', { detail: { watchedMs: state.watched.ms, share: state.watched.share } }))
  return true
}

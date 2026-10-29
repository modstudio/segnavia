import type { DeckState } from './controller-types.ts'

export function emitControllerState(target: EventTarget, state: DeckState, lastCue: string): string {
  target.dispatchEvent(new CustomEvent('change', { detail: state }))
  const cue = state.shown === null ? 'all' : state.shown.join(',')
  if (cue !== lastCue) target.dispatchEvent(new CustomEvent('cue', { detail: { annotations: state.shown } }))
  return cue
}

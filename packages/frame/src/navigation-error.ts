import type { Deck } from '@segnavia/format'
import { SlideRefusedError } from './deck-refusal.ts'
import { dispatchElementError } from './element-error.ts'

export function slideIdAt(deck: Deck | null | undefined, index: number): string {
  return deck?.slides[index]?.id ?? String(index)
}

export function navigationError(target: EventTarget & { pause(): void; state: { deck: Deck | null } }, playing: boolean, index: number, error: unknown): never {
  if (playing) target.pause()
  const refusal = new SlideRefusedError(index, slideIdAt(target.state.deck, index), error)
  dispatchElementError(target, refusal)
  throw error
}

import { DeckRefusedError } from './deck-refusal.ts'
import { dispatchElementError } from './element-error.ts'
import { validateWatchedSeed, type WatchedSeed } from './watched-seed.ts'

export interface DeckLoadOptions {
  base?: string
  watched?: WatchedSeed
}

export function deckLoadOptions(input: string | DeckLoadOptions | undefined): DeckLoadOptions {
  if (typeof input === 'string') return { base: input }
  if (!input) return {}
  return { base: input.base, watched: input.watched === undefined ? undefined : validateWatchedSeed(input.watched) }
}

export function reportedDeckLoadOptions(target: EventTarget, input: string | DeckLoadOptions | undefined, subject?: string): DeckLoadOptions {
  try {
    return deckLoadOptions(input)
  } catch (error) {
    dispatchElementError(target, new DeckRefusedError(error, subject))
    throw error
  }
}

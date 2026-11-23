import type { Deck } from '@segnavia/format'
import type { BrandsOptions } from './brands.ts'
import { resolveDeckLoad } from './deck-load-origin.ts'
import { DeckRefusedError } from './deck-refusal.ts'
import { dispatchElementError } from './element-error.ts'

export async function resolveControllerDeck(
  target: EventTarget,
  input: unknown,
  source: BrandsOptions['source'] | undefined,
  signal: AbortSignal,
  guarded: Promise<void> | undefined,
  internal: boolean,
  edition: string | undefined,
  base: string | undefined,
): Promise<Deck | undefined> {
  try {
    return await resolveDeckLoad(input, source, signal, guarded, internal, edition)
  } catch (error) {
    if (signal.aborted) return undefined
    dispatchElementError(target, new DeckRefusedError(error, base))
    throw error
  }
}

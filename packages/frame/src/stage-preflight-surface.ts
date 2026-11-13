import type { DeckState } from './controller.ts'
import { deckFolioAt, deckFolios } from './deck-folios.ts'
import { surfacePreflightFor } from './surface-preflight.ts'

export function setStagePreflightSurface(target: EventTarget, deck: NonNullable<DeckState['deck']>): void {
  const folios = deckFolios(deck)
  surfacePreflightFor(target).setSurface(
    deck.slides.map((slide, index) => ({ key: slide.id, folio: deckFolioAt(folios, index).text })),
    'slide',
    true,
  )
}

import { type Folio, sequenceFolios } from '@segnavia/format'

export function deckFolios(deck: { slides: readonly unknown[] } | null | undefined): Folio[] {
  return sequenceFolios(deck?.slides.length ?? 0, 'arabic')
}

export function deckFolioAt(folios: readonly Folio[], index: number): Folio {
  const folio = folios[index]
  if (!folio) throw new RangeError(`Slide ${index} has no computed folio.`)
  return folio
}

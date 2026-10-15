import type { Deck } from './index.ts'

export interface ShotUse {
  slide: string
  key?: string
  href?: string
}

// Every shot a deck shows, so a host can record where each one is used and
// say which decks a recapture reaches.
export function shotsUsed(deck: Deck): ShotUse[] {
  return deck.slides.flatMap((slide): ShotUse[] => {
    if (slide.content.kind === 'shot') return [{ slide: slide.id, key: slide.content.shot.key }]
    if (slide.content.kind === 'shot-ref') return [{ slide: slide.id, href: slide.content.href }]
    return []
  })
}

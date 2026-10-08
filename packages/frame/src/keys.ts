// What a key does to a deck. Arrow keys follow reading direction, as
// horizontal navigation does in a right to left interface: in a right to left
// deck the left arrow moves forward. Page keys and Space mean the same thing
// in either direction.

import type { TextDirection } from '@segnavia/format'

export type DeckAction = 'next' | 'previous' | 'toggle' | 'exit'

export function keyAction(key: string, direction: TextDirection): DeckAction | null {
  switch (key) {
    case 'PageDown':
      return 'next'
    case 'PageUp':
      return 'previous'
    case 'ArrowRight':
      return direction === 'rtl' ? 'previous' : 'next'
    case 'ArrowLeft':
      return direction === 'rtl' ? 'next' : 'previous'
    case ' ':
      return 'toggle'
    case 'Escape':
      return 'exit'
    default:
      return null
  }
}

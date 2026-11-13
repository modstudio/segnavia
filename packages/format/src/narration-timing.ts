import type { Deck, Narration } from './deck.ts'
import { type NarrationTiming, pacedWords } from './paced-words.ts'

export const DEFAULT_READING_SPEED = 180
export type NarrationPacing = Pick<Deck, 'readingSpeed'>

export function narrationTiming(narration: Narration, deck: NarrationPacing): NarrationTiming {
  return narration.kind === 'text' ? pacedWords(narration.text, deck.readingSpeed ?? DEFAULT_READING_SPEED) : narration
}

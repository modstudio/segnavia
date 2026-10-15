import type { Deck } from '@segnavia/format'
import type { DeckController } from './controller.ts'

export interface MoveSlideInput {
  slideId: string
  fromIndex: number
  toIndex: number
}

export type MoveSlideHandler = (input: MoveSlideInput) => Promise<void>

function reordered(deck: Deck, fromIndex: number, toIndex: number): Deck {
  const slides = [...deck.slides]
  const [slide] = slides.splice(fromIndex, 1)
  if (!slide) throw new RangeError(`Slide ${fromIndex + 1} is outside the deck.`)
  slides.splice(toIndex, 0, slide)
  return { ...deck, slides }
}

export async function moveSlideOptimistically(controller: DeckController, fromIndex: number, toIndex: number, save: MoveSlideHandler): Promise<void> {
  const previous = controller.state.deck
  const slide = previous?.slides[fromIndex]
  if (!previous || !slide || toIndex < 0 || toIndex >= previous.slides.length || fromIndex === toIndex) return
  await controller.load(reordered(previous, fromIndex, toIndex))
  try {
    await save({ slideId: slide.id, fromIndex, toIndex })
  } catch (error) {
    await controller.load(previous)
    throw error
  }
}

export function railMoveTarget(fromIndex: number, overIndex: number, after: boolean, count: number): number {
  const insertion = overIndex + (after ? 1 : 0)
  return Math.max(0, Math.min(count - 1, insertion > fromIndex ? insertion - 1 : insertion))
}

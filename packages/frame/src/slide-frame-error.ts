import { Refusal } from '@segnavia/format'
import { causeMessage, nestedRefusals } from './deck-refusal.ts'

export class SlideFrameError extends Refusal {
  constructor(
    readonly slideId: string,
    readonly index: number,
    cause: unknown,
  ) {
    super('slide-frame', `The frame for slide "${slideId}" could not be established. New content for the slide clears this refusal. ${causeMessage(cause)}`, {
      subject: slideId,
      cause,
      refusals: nestedRefusals(cause),
    })
    this.name = 'SlideFrameError'
  }
}

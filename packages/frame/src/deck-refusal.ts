import { Refusal, type RefusalCause } from '@segnavia/format'

export function causeMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

export function nestedRefusals(cause: unknown): readonly RefusalCause[] {
  if (!(cause instanceof Refusal)) return []
  return [{ code: cause.code, subject: cause.subject, message: cause.message }, ...cause.refusals]
}

export class DeckRefusedError extends Refusal {
  override name = 'DeckRefusedError'

  constructor(cause: unknown, subject?: string) {
    super('deck', `The deck could not be established. Load another deck to clear this refusal. ${causeMessage(cause)}`, {
      subject,
      cause,
      refusals: nestedRefusals(cause),
    })
  }
}

export class SlideRefusedError extends Refusal {
  override name = 'SlideRefusedError'

  constructor(
    readonly index: number,
    slideId: string,
    cause: unknown,
  ) {
    super('slide', `Slide "${slideId}" could not be established. Show it successfully or load another deck to clear this refusal. ${causeMessage(cause)}`, {
      subject: slideId,
      cause,
      refusals: nestedRefusals(cause),
    })
  }
}

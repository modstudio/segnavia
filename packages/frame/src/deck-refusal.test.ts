import { expect, test } from 'bun:test'
import { Refusal } from '@segnavia/format'
import { DeckRefusedError, SlideRefusedError } from './deck-refusal.ts'
import { SlideFrameError } from './slide-frame-error.ts'

test('deck, slide, and frame refusals preserve a refusal cause and its nested reasons', () => {
  const leaf = { code: 'leaf', subject: 'font', message: 'The font was unavailable.' }
  const cause = new Refusal('style', 'The style sheet was refused.', { subject: 'theme.css', refusals: [leaf] })

  for (const refusal of [new DeckRefusedError(cause, 'deck.json'), new SlideRefusedError(2, 'third', cause), new SlideFrameError('third', 2, cause)]) {
    expect(refusal.cause).toBe(cause)
    expect(refusal.refusals).toEqual([{ code: 'style', subject: 'theme.css', message: cause.message }, leaf])
  }
})

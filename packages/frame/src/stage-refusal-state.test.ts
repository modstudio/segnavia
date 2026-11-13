import { expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import { initialDeckState } from './controller-types.ts'
import { DeckRefusedError, SlideRefusedError } from './deck-refusal.ts'
import { SlideFrameError } from './slide-frame-error.ts'
import { StageRefusalState } from './stage-refusal-state.ts'

class Host extends EventTarget {
  dataset: Record<string, string> = {}
}

test('a stage refusal sets its public state and a successful content change clears it', () => {
  const slide = { id: 'first', content: { kind: 'html' as const, html: 'first' } }
  const deck = Deck.parse({ title: 'Deck', slides: [slide] })
  const failed = { ...initialDeckState(), deck, slide: deck.slides[0] ?? null, content: null }
  const host = new Host()
  const state = new StageRefusalState(host as unknown as HTMLElement)
  let changes = 0
  host.addEventListener('refusalchange', () => changes++)

  const refusal = new SlideRefusedError(0, 'first', new Error('refused'))
  state.arrive(refusal, failed)
  expect(state.refusal).toBe(refusal)
  expect(host.dataset.refused).toBe('slide')
  expect(changes).toBe(1)

  state.update({ ...failed, content: slide.content })
  expect(state.refusal).toBeNull()
  expect(host.dataset.refused).toBeUndefined()
  expect(changes).toBe(2)
})

test("a neighbor's frame failure leaves the shown frame refusal in place", () => {
  const first = { id: 'first', content: { kind: 'html' as const, html: 'first' } }
  const deck = Deck.parse({ title: 'Deck', slides: [first, { id: 'second', content: { kind: 'html', html: 'second' } }] })
  const shown = { ...initialDeckState(), deck, slide: deck.slides[0] ?? null, content: first.content }
  const shownFailure = new SlideFrameError('first', 0, new Error('shown failed'))
  const state = new StageRefusalState(new Host() as unknown as HTMLElement, () => shownFailure)

  state.update(shown)
  state.arrive(new SlideFrameError('second', 1, new Error('neighbor failed')), shown)

  expect(state.refusal).toBe(shownFailure)
})

test('an inapplicable slide refusal does not replace a deck refusal', () => {
  const first = { id: 'first', content: { kind: 'html' as const, html: 'first' } }
  const deck = Deck.parse({ title: 'Deck', slides: [first, { id: 'second', content: { kind: 'html', html: 'second' } }] })
  const shown = { ...initialDeckState(), deck, slide: deck.slides[0] ?? null, content: first.content }
  const state = new StageRefusalState(new Host() as unknown as HTMLElement)
  const deckRefusal = new DeckRefusedError(new Error('deck failed'))

  state.arrive(deckRefusal, shown)
  state.arrive(new SlideRefusedError(1, 'second', new Error('navigation failed')), shown)

  expect(state.refusal).toBe(deckRefusal)
})

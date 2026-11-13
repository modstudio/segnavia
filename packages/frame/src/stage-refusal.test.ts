import { expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import { initialDeckState, type ResolvedContent } from './controller-types.ts'
import { DeckRefusedError, SlideRefusedError } from './deck-refusal.ts'
import { applicableStageRefusal, stageRefusalRecord } from './stage-refusal.ts'

const first = { id: 'first', content: { kind: 'html' as const, html: 'first' } }
const second = { id: 'second', content: { kind: 'html' as const, html: 'second' } }
const deck = Deck.parse({ title: 'Deck', slides: [first, second] })
const content: ResolvedContent = first.content
const state = { ...initialDeckState(), deck, slide: first, content }

test('a deck refusal applies until a new deck loads', () => {
  const record = stageRefusalRecord(new DeckRefusedError(new Error('invalid')), 'deck', state)
  expect(applicableStageRefusal(record, state)).toBe(record)
  expect(applicableStageRefusal(record, { ...state, deck: { ...deck } })).toBeNull()
})

test('a first-show slide refusal applies with null content and clears when content arrives', () => {
  const failed = { ...state, content: null }
  const record = stageRefusalRecord(new SlideRefusedError(0, 'first', new Error('refused')), 'slide', failed)
  expect(applicableStageRefusal(record, failed)).toBe(record)
  expect(applicableStageRefusal(record, state)).toBeNull()
})

test('a navigation refusal for another slide does not apply to the shown slide', () => {
  const record = stageRefusalRecord(new SlideRefusedError(1, 'second', new Error('refused')), 'slide', state)
  expect(applicableStageRefusal(record, state)).toBeNull()
})

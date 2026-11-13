import { expect, test } from 'bun:test'
import { DeckController } from './controller.ts'
import { DeckRefusedError, SlideRefusedError } from './deck-refusal.ts'

const deck = { title: 'Deck', slides: [{ id: 'first', content: { kind: 'html' as const, html: '<p>First</p>' } }] }

test('a refused first show dispatches one slide refusal and load keeps rejecting with the host error', async () => {
  const cause = new Error('host refused first')
  const controller = new DeckController({ hash: null, persist: false, resolveSlide: () => Promise.reject(cause) })
  const errors: ErrorEvent[] = []
  controller.addEventListener('error', (event) => errors.push(event as ErrorEvent))

  await expect(controller.loadDeckValue(deck)).rejects.toBe(cause)

  expect(errors).toHaveLength(1)
  expect(errors[0]).toBeInstanceOf(ErrorEvent)
  expect(errors[0]?.error).toBeInstanceOf(SlideRefusedError)
  expect(errors[0]?.error).toMatchObject({ index: 0, subject: 'first', cause })
  expect(controller.state).toMatchObject({ slide: { id: 'first' }, content: null })
})

test('a parse failure dispatches a deck refusal and load keeps rejecting', async () => {
  const controller = new DeckController({ hash: null, persist: false })
  const errors: ErrorEvent[] = []
  controller.addEventListener('error', (event) => errors.push(event as ErrorEvent))

  await expect(controller.loadDeckValue({ title: 'Invalid' })).rejects.toThrow()

  expect(errors).toHaveLength(1)
  expect(errors[0]?.error).toBeInstanceOf(DeckRefusedError)
})

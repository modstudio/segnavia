import { afterAll, beforeAll, expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import type { DeckState } from './controller.ts'
import { initialDeckState } from './controller-types.ts'
import { harness, installFramePoolTestDocument, state } from './frame-pool.test-helper.ts'
import { StyleSheetRefusedError } from './frame-style-sheets.ts'
import type { SlideFrameError } from './slide-frame-error.ts'
import { recordFrameRefusal, shownFrameRefusal } from './stage-frame-refusal.ts'

let restoreDocument = () => {}
beforeAll(() => {
  restoreDocument = installFramePoolTestDocument()
})
afterAll(() => restoreDocument())

const one = { kind: 'url' as const, src: 'one.html' }
const two = { kind: 'url' as const, src: 'two.html' }

test('a recorded frame refusal carries the failed slide deck index and stays on its pooled frame', async () => {
  const { pool, controller, options } = harness([one, two])
  pool.update(state(0, one), controller, options)
  await Promise.resolve()
  const cause = new Error('neighbor failed')

  const error = recordFrameRefusal(pool, controller, 'two', cause)

  expect(error).toMatchObject({ slideId: 'two', index: 1, cause })
  expect(shownFrameRefusal(pool, state(1, two))).toBe(error)
  expect(shownFrameRefusal(pool, state(0, one))).toBeNull()
})

test('a pooled failure that is not a frame refusal does not refuse the stage', async () => {
  const { pool, controller, options } = harness([one, two])
  pool.update(state(0, one), controller, options)
  await Promise.resolve()
  pool.markFailed('one', new Error('not a frame refusal'))

  expect(pool.failureFor(state(0, one))).toBeInstanceOf(Error)
  expect(shownFrameRefusal(pool, state(0, one))).toBeNull()
})

test('a style sheet refused while the shown frame is built refuses the stage and reports once', () => {
  const { pool, controller, options } = harness([one, two])
  const deck = Deck.parse({
    title: 'Refused style',
    style: { textStyles: { body: { kind: 'paragraph', basedOn: 'missing' } } },
    slides: [{ id: 'one', content: { kind: 'html', html: '<p>One</p>' } }],
  })
  const content = { kind: 'html' as const, html: '<p>One</p>' }
  const shown: DeckState = { ...initialDeckState(), deck, index: 0, slide: deck.slides[0] ?? null, content }
  const reported: SlideFrameError[] = []
  Object.assign(controller, { state: shown })
  const reportSlideError = (slideId: string, cause: Error) => reported.push(recordFrameRefusal(pool, controller, slideId, cause))

  pool.update(shown, controller, { ...options, neighbors: false, reportSlideError })

  expect(reported).toHaveLength(1)
  expect(reported[0]?.cause).toBeInstanceOf(StyleSheetRefusedError)
  expect(shownFrameRefusal(pool, shown)).toBe(reported[0] ?? null)
})

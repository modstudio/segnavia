import { expect, test } from 'bun:test'
import { AuthoringController, type AuthoringErrorDetail } from './authoring.ts'
import { printFrameBounds } from './authoring-print-moment.ts'
import { DeckController } from './controller.ts'
import { PrintMomentSaveQueue } from './print-moment-save.ts'

test('the slider uses the animation length and falls back to ten seconds', () => {
  expect(printFrameBounds(3250)).toEqual({ min: 0, max: 3250, step: 1 })
  expect(printFrameBounds(null)).toEqual({ min: 0, max: 10_000, step: 1 })
})

test('the slider draft changes without saving and Done saves once', async () => {
  const saves: Array<{ slideId: string; printAtMs: number | null }> = []
  const queue = new PrintMomentSaveQueue(
    async (input) => {
      saves.push(input)
    },
    () => {},
  )
  queue.seed('animated', null)
  queue.editDraft('animated', 1235)
  expect(queue.draft('animated')).toBe(1235)
  expect(saves).toEqual([])
  await queue.flush('animated')
  await queue.flush('animated')
  expect(saves).toEqual([{ slideId: 'animated', printAtMs: 1235 }])
})

test('Reset drafts and sends null', async () => {
  const saves: Array<number | null> = []
  const queue = new PrintMomentSaveQueue(
    async ({ printAtMs }) => {
      saves.push(printAtMs)
    },
    () => {},
  )
  queue.seed('animated', 1200)
  queue.editDraft('animated', null)
  await queue.flush('animated')
  expect(saves).toEqual([null])
})

test('a failed print moment save reports its operation and remains in draftDeck', async () => {
  const deckController = new DeckController({ hash: null })
  await deckController.load({
    title: 'Deck',
    slides: [{ id: 'animated', content: { kind: 'html', html: '<p>Animated</p>' } }],
  })
  const player = Object.assign(new EventTarget(), { controller: deckController, setAuthoringScriptsRefused() {} })
  const authoring = new AuthoringController(player as never, {}, { notesMaxLength: 20_000 })
  const failed = (authoring as unknown as { printMomentFailed(slideId: string, error: unknown): void }).printMomentFailed
  const queue = new PrintMomentSaveQueue(
    async () => {
      throw new Error('Offline')
    },
    () => {},
    () => {},
    failed,
  )
  queue.seed('animated', null)
  const errors: AuthoringErrorDetail[] = []
  authoring.addEventListener('authoring-error', (event) => errors.push((event as CustomEvent<AuthoringErrorDetail>).detail))
  queue.edit('animated', 875)
  expect(await queue.flush('animated')).toBe(false)
  Object.assign(authoring, { printMoment: { queue } })

  expect(authoring.draftDeck()?.slides[0]?.printAtMs).toBe(875)
  expect(errors).toEqual([{ operation: 'printMoment', slideId: 'animated', message: 'Offline', error: expect.any(Error) }])
})

test('print moment saves are serialized per slide', async () => {
  let release = () => {}
  const calls: number[] = []
  const queue = new PrintMomentSaveQueue(
    ({ printAtMs }) => {
      calls.push(printAtMs ?? 0)
      return calls.length === 1 ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve()
    },
    () => {},
  )
  queue.seed('animated', null)
  queue.edit('animated', 100)
  queue.edit('animated', 200)
  expect(calls).toEqual([100])
  release()
  await queue.flush('animated')
  expect(calls).toEqual([100, 200])
})

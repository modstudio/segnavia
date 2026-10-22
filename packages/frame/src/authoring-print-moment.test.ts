import { expect, test } from 'bun:test'
import { AuthoringController, type AuthoringErrorDetail } from './authoring.ts'
import { AuthoringPrintMoment, printFrameBounds } from './authoring-print-moment.ts'
import { DeckController } from './controller.ts'
import { PrintMomentSaveQueue } from './print-moment-save.ts'

test('the slider uses the animation length and falls back to ten seconds', () => {
  expect(printFrameBounds(3250)).toEqual({ min: 0, max: 3250, step: 1 })
  expect(printFrameBounds(null)).toEqual({ min: 0, max: 10_000, step: 1 })
})

test('an accepted animation report refreshes an already rendered section', () => {
  let railRefreshes = 0
  let sectionRefreshes = 0
  const printMoment = Reflect.construct(Object, [], AuthoringPrintMoment) as AuthoringPrintMoment
  Object.assign(printMoment, {
    metadata: new Map(),
    settings: { refresh: () => railRefreshes++ },
    sectionChanges: new Set([() => sectionRefreshes++]),
  })

  ;(
    printMoment as unknown as {
      acceptReport(report: { slideId: string; animated: boolean; lengthMs: number | null }, source: 'stage' | 'thumbnail'): void
    }
  ).acceptReport({ slideId: 'animated', animated: true, lengthMs: 3000 }, 'stage')

  expect(railRefreshes).toBe(1)
  expect(sectionRefreshes).toBe(1)
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

test('a replacement handler never receives a draft that failed under the old handler', async () => {
  const oldCalls: Array<number | null> = []
  const newCalls: Array<number | null> = []
  const queue = new PrintMomentSaveQueue(
    async ({ printAtMs }) => {
      oldCalls.push(printAtMs)
      throw new Error('Old handler refused')
    },
    () => {},
  )
  queue.seed('shared', null)
  queue.editDraft('shared', 900)
  expect(await queue.flush('shared')).toBe(false)
  expect(
    await queue.setSave(async ({ printAtMs }) => {
      newCalls.push(printAtMs)
    }),
  ).toBe(false)
  expect(queue.seed('shared', null)).toBe(false)
  expect(await queue.flush('shared')).toBe(false)
  expect(oldCalls).toEqual([900, 900, 900])
  expect(newCalls).toEqual([])
})

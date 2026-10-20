import { expect, test } from 'bun:test'
import { AuthoringController, type AuthoringErrorDetail } from './authoring.ts'
import { AuthoringPrintMoment } from './authoring-print-moment.ts'
import { DeckController } from './controller.ts'
import { PrintMomentSaveQueue } from './print-moment-save.ts'

function printMomentControl(
  state: { slide: { id: string; content: { kind: 'html'; html: string } }; playing: boolean; slideElapsedMs: number },
  queue: PrintMomentSaveQueue,
) {
  const control = Object.create(AuthoringPrintMoment.prototype) as AuthoringPrintMoment
  Object.assign(control, { player: { controller: { state } }, queue })
  return control as unknown as { useCurrentFrame(): void; reset(): void }
}

test('Use this frame saves the rounded slide-local position and Reset clears it', async () => {
  const saves: Array<{ slideId: string; printAtMs: number | null }> = []
  const queue = new PrintMomentSaveQueue(
    async (input) => {
      saves.push(input)
    },
    () => {},
  )
  queue.seed('animated', null)
  const state = { slide: { id: 'animated', content: { kind: 'html' as const, html: '' } }, playing: false, slideElapsedMs: 1234.6 }
  const control = printMomentControl(state, queue)

  control.useCurrentFrame()
  await queue.flush('animated')
  control.reset()
  await queue.flush('animated')

  expect(saves).toEqual([
    { slideId: 'animated', printAtMs: 1235 },
    { slideId: 'animated', printAtMs: null },
  ])
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

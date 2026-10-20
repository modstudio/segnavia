import { describe, expect, test } from 'bun:test'
import { AuthoringController } from './authoring.ts'
import { DeckController } from './controller.ts'
import { NotesSaveQueue } from './notes-save.ts'
import { printableDeck } from './print-document.ts'

async function authoringWithNotes(
  save: (input: { slideId: string; notes: string }) => Promise<void> = async () => {},
  handlers: ConstructorParameters<typeof AuthoringController>[1] = {},
) {
  const deckController = new DeckController({ hash: null })
  await deckController.load({
    title: 'Deck',
    slides: [
      { id: 'a', content: { kind: 'html', html: 'A' }, notes: 'old' },
      { id: 'b', content: { kind: 'html', html: 'B' }, notes: 'b-old' },
    ],
  })
  const field = { value: 'old' }
  const rail = {
    setReorderEnabled() {},
    subscribeReorder: () => () => {},
  }
  const player = Object.assign(new EventTarget(), {
    controller: deckController,
    authoringRail: () => rail,
    setAuthoringScriptsRefused() {},
  })
  const authoring = new AuthoringController(player as never, handlers, { notesMaxLength: 20_000 })
  const queue = new NotesSaveQueue(save, () => {})
  queue.seed('a', 'old')
  queue.seed('b', 'b-old')
  Object.assign(authoring, {
    notes: queue,
    notesSlideId: 'a',
    notesRoot: { querySelector: () => field, remove() {} },
  })
  return { authoring, deckController, field, queue }
}

describe('authoring adoptNotes', () => {
  test('a clean adopt updates the textarea without changing the slide index', async () => {
    const { authoring, deckController, field, queue } = await authoringWithNotes()
    const index = deckController.state.index
    authoring.adoptNotes({ a: 'from another tab', b: null })
    expect(field.value).toBe('from another tab')
    expect(queue.state('a').text).toBe('from another tab')
    expect(queue.state('b').text).toBe('')
    expect(authoring.dirty).toBe(false)
    expect(deckController.state.index).toBe(index)
  })

  test('a dirty draft survives a host notes adopt', async () => {
    const { authoring, field, queue } = await authoringWithNotes()
    queue.edit('a', 'local draft')
    field.value = 'local draft'
    authoring.adoptNotes({ a: 'host notes' })
    expect(field.value).toBe('local draft')
    expect(queue.state('a').text).toBe('local draft')
    expect(authoring.dirty).toBe(true)
  })

  test('an in-flight save survives a host notes adopt', async () => {
    let release = () => {}
    const { authoring, field, queue } = await authoringWithNotes(() => new Promise<void>((resolve) => (release = resolve)))
    queue.edit('a', 'in flight')
    field.value = 'in flight'
    const saving = queue.flush('a')
    authoring.adoptNotes({ a: 'host notes' })
    expect(field.value).toBe('in flight')
    expect(queue.state('a').text).toBe('in flight')
    release()
    await saving
  })
})

test('dirty includes an unsettled move and clears when it settles', async () => {
  let release = () => {}
  let markStarted = () => {}
  const started = new Promise<void>((resolve) => (markStarted = resolve))
  const { authoring } = await authoringWithNotes(async () => {}, {
    moveSlide: () => {
      markStarted()
      return new Promise<void>((resolve) => (release = resolve))
    },
  })
  const dirty: boolean[] = []
  authoring.addEventListener('dirty-change', (event) => dirty.push((event as CustomEvent<{ dirty: boolean }>).detail.dirty))
  const moving = (authoring as unknown as { move(fromIndex: number, toIndex: number): Promise<void> }).move(0, 1)
  expect(authoring.dirty).toBe(true)
  expect(dirty).toEqual([true])
  await started
  expect(authoring.dirty).toBe(true)
  release()
  await moving
  expect(authoring.dirty).toBe(false)
  expect(dirty).toEqual([true, false])
})

test('dirty recomputes when a held move rejects', async () => {
  let rejectMove = (_error: Error) => {}
  let markStarted = () => {}
  const started = new Promise<void>((resolve) => (markStarted = resolve))
  const { authoring } = await authoringWithNotes(async () => {}, {
    moveSlide: () => {
      markStarted()
      return new Promise<void>((_resolve, reject) => (rejectMove = reject))
    },
  })
  const moving = (authoring as unknown as { move(fromIndex: number, toIndex: number): Promise<void> }).move(0, 1)
  await started
  expect(authoring.dirty).toBe(true)
  rejectMove(new Error('Move refused'))
  await moving
  expect(authoring.dirty).toBe(false)
})

test('draftDeck returns on-screen notes without waiting for a never-settling save', async () => {
  const { authoring, queue } = await authoringWithNotes(() => new Promise<void>(() => {}))
  queue.edit('a', 'on screen')
  const started = Date.now()
  const drafted = authoring.draftDeck()
  expect(Date.now() - started).toBeLessThan(20)
  expect(drafted?.title).toBe('Deck')
  expect(drafted?.slides[0]?.notes).toBe('on screen')
  if (drafted) expect(printableDeck(drafted, { layout: 'notes' })).toContain('on screen')
})

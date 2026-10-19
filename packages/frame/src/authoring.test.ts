import { describe, expect, test } from 'bun:test'
import { AuthoringController, type AuthoringErrorDetail } from './authoring.ts'
import { DeckController } from './controller.ts'
import { NotesSaveQueue } from './notes-save.ts'
import { printableDeck } from './print-document.ts'

class PlayerStub extends EventTarget {
  controller = new EventTarget()
  setAuthoringScriptsRefused() {}
}

describe('authoring detach', () => {
  test('flushes a pending edit before teardown and is safe to call twice', async () => {
    const player = new PlayerStub()
    let release = () => {}
    const saves: string[] = []
    const queue = new NotesSaveQueue(
      ({ notes }) => {
        saves.push(notes)
        return new Promise<void>((resolve) => (release = resolve))
      },
      () => {},
    )
    queue.seed('a', '')
    queue.edit('a', 'draft')
    const controller = new AuthoringController(player as never, {}, { notesMaxLength: 20_000 })
    ;(controller as unknown as { notes: NotesSaveQueue }).notes = queue
    let removed = false
    ;(controller as unknown as { notesRoot: { remove(): void } }).notesRoot = { remove: () => (removed = true) }
    const first = controller.detach()
    const second = controller.detach()
    expect(first).toBe(second)
    expect(saves).toEqual(['draft'])
    expect(removed).toBe(true)
    let settled = false
    void first.then(() => (settled = true))
    await Promise.resolve()
    expect(settled).toBe(false)
    release()
    await first
    expect(settled).toBe(true)
  })

  test('emits an authoring error for a failed save without rejecting detach', async () => {
    const player = new PlayerStub()
    const controller = new AuthoringController(player as never, {}, { notesMaxLength: 20_000 })
    const notesFailed = (controller as unknown as { notesFailed(slideId: string, error: unknown): void }).notesFailed
    const queue = new NotesSaveQueue(
      async () => {
        throw new Error('Offline')
      },
      () => {},
      undefined,
      () => {},
      notesFailed,
    )
    queue.seed('a', '')
    queue.edit('a', 'draft')
    ;(controller as unknown as { notes: NotesSaveQueue }).notes = queue
    const errors: Array<{ operation: string; slideId: string; message: string; error: unknown }> = []
    controller.addEventListener('authoring-error', (event) => errors.push((event as CustomEvent).detail))
    await expect(controller.detach()).resolves.toBeUndefined()
    expect(errors).toEqual([{ operation: 'notes', slideId: 'a', message: 'Offline', error: expect.any(Error) }])
  })
})

describe('authoring flush', () => {
  async function controllerWithNotes(save: (input: { slideId: string; notes: string }) => Promise<void>) {
    const deckController = new DeckController({ hash: null })
    await deckController.load({
      title: 'Deck',
      slides: [{ id: 'a', content: { kind: 'html', html: 'A' }, notes: 'old' }],
    })
    const player = Object.assign(new EventTarget(), {
      controller: deckController,
      setAuthoringScriptsRefused() {},
    })
    const authoring = new AuthoringController(player as never, {}, { notesMaxLength: 20_000 })
    const queue = new NotesSaveQueue(save, () => {})
    queue.seed('a', 'old')
    ;(authoring as unknown as { notes: NotesSaveQueue }).notes = queue
    return { authoring, queue }
  }

  test('a note edited less than 600ms before flush appears in the printed notes document', async () => {
    const saves: string[] = []
    const { authoring } = await controllerWithNotes(async ({ notes }) => {
      saves.push(notes)
    })
    const field = { value: 'typed just now' }
    ;(authoring as unknown as { notesSlideId: string }).notesSlideId = 'a'
    ;(authoring as unknown as { editNotes(event: Event): void }).editNotes({ currentTarget: field } as unknown as Event)
    const flushed = await authoring.flush()
    expect(flushed).not.toBeNull()
    if (!flushed) return
    expect(printableDeck(flushed, { layout: 'notes' })).toContain('typed just now')
    expect(printableDeck(flushed, { layout: 'notes' })).not.toContain('>old<')
    expect(saves).toEqual(['typed just now'])
  })

  test('a draft whose save failed still appears in the flushed notes document', async () => {
    const { authoring, queue } = await controllerWithNotes(async () => {
      throw new Error('Offline')
    })
    queue.edit('a', 'failed draft')
    expect(await queue.flush('a')).toBe(false)
    const flushed = await authoring.flush()
    expect(flushed).not.toBeNull()
    if (!flushed) return
    expect(printableDeck(flushed, { layout: 'notes' })).toContain('failed draft')
    expect(queue.state('a')).toMatchObject({ text: 'failed draft', status: 'error' })
  })

  test('does not fire a save when the notes are already saved', async () => {
    const saves: string[] = []
    const { authoring } = await controllerWithNotes(async ({ notes }) => {
      saves.push(notes)
    })
    const flushed = await authoring.flush()
    expect(saves).toEqual([])
    expect(flushed?.slides[0]?.notes).toBe('old')
  })
})

test('a rejected reorder rolls back a frozen deck and reports the move error', async () => {
  const deckController = new DeckController({ hash: null })
  await deckController.load({
    title: 'Deck',
    slides: [
      { id: 'a', content: { kind: 'html', html: 'A' } },
      { id: 'b', content: { kind: 'html', html: 'B' } },
    ],
  })
  Object.freeze(deckController.state.deck)
  const rail = {
    setReorderEnabled() {},
    subscribeReorder: () => () => {},
  }
  const player = Object.assign(new EventTarget(), {
    controller: deckController,
    authoringRail: () => rail,
  })
  const authoring = new AuthoringController(player as never, { moveSlide: async () => Promise.reject(new Error('Move refused')) }, { notesMaxLength: 20_000 })
  const errors: AuthoringErrorDetail[] = []
  authoring.addEventListener('authoring-error', (event) => errors.push((event as CustomEvent).detail))

  await (authoring as unknown as { move(fromIndex: number, toIndex: number): Promise<void> }).move(0, 1)

  expect(deckController.state.deck?.slides.map((slide) => slide.id)).toEqual(['a', 'b'])
  expect(errors).toEqual([{ message: 'Move refused', operation: 'move', slideId: 'a', error: expect.any(Error) }])
})

test('a rejected reorder does not replace a newer host deck and reports the move error', async () => {
  const deckController = new DeckController({ hash: null })
  await deckController.load({
    title: 'Deck',
    slides: [
      { id: 'a', content: { kind: 'html', html: 'A' } },
      { id: 'b', content: { kind: 'html', html: 'B' } },
    ],
  })
  let rejectMove = (_error: Error) => {}
  let markMoveStarted = () => {}
  const moveStarted = new Promise<void>((resolve) => (markMoveStarted = resolve))
  const rail = {
    setReorderEnabled() {},
    subscribeReorder: () => () => {},
  }
  const player = Object.assign(new EventTarget(), {
    controller: deckController,
    authoringRail: () => rail,
  })
  const authoring = new AuthoringController(
    player as never,
    {
      moveSlide: () => {
        markMoveStarted()
        return new Promise<void>((_resolve, reject) => (rejectMove = reject))
      },
    },
    { notesMaxLength: 20_000 },
  )
  const errors: AuthoringErrorDetail[] = []
  authoring.addEventListener('authoring-error', (event) => errors.push((event as CustomEvent).detail))

  const moving = (authoring as unknown as { move(fromIndex: number, toIndex: number): Promise<void> }).move(0, 1)
  await moveStarted
  await deckController.load({
    title: 'New host deck',
    slides: [
      { id: 'a', content: { kind: 'html', html: 'Host A' } },
      { id: 'b', content: { kind: 'html', html: 'Host B' } },
    ],
  })
  rejectMove(new Error('Move refused'))
  await moving

  expect(deckController.state.deck?.title).toBe('New host deck')
  expect(errors).toEqual([{ message: 'Move refused', operation: 'move', slideId: 'a', error: expect.any(Error) }])
})

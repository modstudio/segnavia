import { describe, expect, test } from 'bun:test'
import { AuthoringController } from './authoring.ts'
import { NotesSaveQueue } from './notes-save.ts'

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
    const first = controller.detach()
    const second = controller.detach()
    expect(first).toBe(second)
    expect(saves).toEqual(['draft'])
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

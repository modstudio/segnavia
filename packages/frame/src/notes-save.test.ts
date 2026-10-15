import { describe, expect, test } from 'bun:test'
import { NotesSaveQueue } from './notes-save.ts'

function scheduler() {
  const pending = new Map<number, () => void>()
  let id = 0
  return {
    set: (run: () => void) => {
      pending.set(++id, run)
      return id
    },
    clear: (timer: number) => pending.delete(timer),
    run: () => {
      for (const task of [...pending.values()]) task()
      pending.clear()
    },
  }
}

describe('notes save queue', () => {
  test('debounces edits, reports dirty state and clears it after save', async () => {
    const time = scheduler()
    const saves: string[] = []
    const dirty: boolean[] = []
    const queue = new NotesSaveQueue(
      async ({ notes }) => {
        saves.push(notes)
      },
      (value) => dirty.push(value),
      time,
    )
    queue.seed('a', '')
    queue.edit('a', 'o')
    queue.edit('a', 'one')
    expect(saves).toEqual([])
    expect(queue.dirty).toBe(true)
    time.run()
    await queue.flush('a')
    expect(saves).toEqual(['one'])
    expect(queue.state('a')).toMatchObject({ status: 'saved' })
    expect(dirty).toEqual([true, false])
  })

  test('flushes immediately and retains rejected text for retry', async () => {
    const time = scheduler()
    let reject = true
    const queue = new NotesSaveQueue(async () => {
      if (reject) throw new Error('Offline')
    }, () => {}, time)
    queue.seed('a', 'old')
    queue.edit('a', 'new')
    await queue.flush('a')
    expect(queue.state('a')).toMatchObject({ text: 'new', status: 'error', message: 'Offline' })
    expect(queue.dirty).toBe(true)
    reject = false
    await queue.retry('a')
    expect(queue.state('a')).toMatchObject({ text: 'new', status: 'saved' })
    expect(queue.dirty).toBe(false)
  })

  test('a newer save supersedes an older in-flight save', async () => {
    const time = scheduler()
    const releases: Array<() => void> = []
    const queue = new NotesSaveQueue(
      () => new Promise<void>((resolve) => releases.push(resolve)),
      () => {},
      time,
    )
    queue.seed('a', '')
    queue.edit('a', 'first')
    time.run()
    queue.edit('a', 'second')
    time.run()
    releases[0]?.()
    await Promise.resolve()
    expect(queue.state('a')).toMatchObject({ text: 'second', status: 'saving' })
    releases[1]?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(queue.state('a')).toMatchObject({ text: 'second', status: 'saved' })
  })
})

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
    const queue = new NotesSaveQueue(
      async () => {
        if (reject) throw new Error('Offline')
      },
      () => {},
      time,
    )
    queue.seed('a', 'old')
    queue.edit('a', 'new')
    expect(await queue.flush('a')).toBe(false)
    expect(queue.state('a')).toMatchObject({ text: 'new', status: 'error', message: 'Offline' })
    expect(queue.dirty).toBe(true)
    reject = false
    expect(await queue.retry('a')).toBe(true)
    expect(queue.state('a')).toMatchObject({ text: 'new', status: 'saved' })
    expect(queue.dirty).toBe(false)
  })

  test('keeps one save in flight per slide and coalesces later edits', async () => {
    const time = scheduler()
    const saves: string[] = []
    const releases: Array<() => void> = []
    const queue = new NotesSaveQueue(
      ({ notes }) => {
        saves.push(notes)
        return new Promise<void>((resolve) => releases.push(resolve))
      },
      () => {},
      time,
    )
    queue.seed('a', '')
    queue.edit('a', 'first')
    time.run()
    await Promise.resolve()
    queue.edit('a', 'second')
    time.run()
    expect(saves).toEqual(['first'])
    expect(queue.dirty).toBe(true)
    releases[0]?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(saves).toEqual(['first', 'second'])
    expect(queue.dirty).toBe(true)
    expect(queue.state('a')).toMatchObject({ text: 'second', status: 'saving' })
    releases[1]?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(saves).toEqual(['first', 'second'])
    expect(queue.state('a')).toMatchObject({ text: 'second', status: 'saved' })
    expect(queue.dirty).toBe(false)
  })

  test('flushes pending notes and waits for in-flight saves before detach', async () => {
    const time = scheduler()
    const saves: string[] = []
    const releases: Array<() => void> = []
    const queue = new NotesSaveQueue(
      ({ notes }) => {
        saves.push(notes)
        return new Promise<void>((resolve) => releases.push(resolve))
      },
      () => {},
      time,
    )
    queue.seed('a', '')
    queue.edit('a', 'first')
    time.run()
    queue.edit('a', 'final')
    let settled = false
    const flushing = queue.flushAll().then(() => (settled = true))
    expect(saves).toEqual(['first'])
    expect(settled).toBe(false)
    releases[0]?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(saves).toEqual(['first', 'final'])
    expect(settled).toBe(false)
    releases[1]?.()
    await flushing
    expect(settled).toBe(true)
  })

  test('reports a failed final flush without throwing', async () => {
    const failures: string[] = []
    const queue = new NotesSaveQueue(
      async () => {
        throw new Error('Offline')
      },
      () => {},
      scheduler(),
      () => {},
      (_slideId, error) => failures.push((error as Error).message),
    )
    queue.seed('a', '')
    queue.edit('a', 'draft')
    expect(await queue.flushAll()).toBe(false)
    expect(failures).toEqual(['Offline'])
  })

  test('adopts host notes only when local work is settled', async () => {
    const time = scheduler()
    let release = () => {}
    const queue = new NotesSaveQueue(
      () => new Promise<void>((resolve) => (release = resolve)),
      () => {},
      time,
    )
    queue.seed('a', 'host one')
    expect(queue.seed('a', 'host two')).toBe(true)
    expect(queue.state('a').text).toBe('host two')
    queue.edit('a', 'local')
    expect(queue.seed('a', 'host three')).toBe(false)
    expect(queue.state('a').text).toBe('local')
    const saving = queue.flush('a')
    expect(queue.seed('a', 'host three')).toBe(false)
    release()
    await saving
    expect(queue.seed('a', 'host three')).toBe(true)
    expect(queue.state('a').text).toBe('host three')
    expect(queue.seed('a', 'host three')).toBe(false)
    expect(queue.dirty).toBe(false)
  })
})

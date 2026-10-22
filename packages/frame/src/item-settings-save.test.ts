import { describe, expect, test } from 'bun:test'
import type { Fill } from '@segnavia/format'
import { FillSaveQueue } from './item-settings-save.ts'

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

const empty: Fill = { id: 'mina', values: { name: '' } }

describe('fill save queue', () => {
  test('coalesces typed edits and keeps one save in flight per fill', async () => {
    const time = scheduler()
    const saves: string[] = []
    const releases: Array<() => void> = []
    const queue = new FillSaveQueue(
      (fill) => {
        saves.push(String(fill.values.name))
        return new Promise<void>((resolve) => releases.push(resolve))
      },
      () => {},
      () => {},
      time,
    )
    queue.seed(empty)
    queue.edit({ id: 'mina', values: { name: 'M' } })
    queue.edit({ id: 'mina', values: { name: 'Mina' } })
    expect(saves).toEqual([])
    time.run()
    await Promise.resolve()
    queue.edit({ id: 'mina', values: { name: 'Mina Patel' } })
    time.run()
    expect(saves).toEqual(['Mina'])
    releases[0]?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(saves).toEqual(['Mina', 'Mina Patel'])
    releases[1]?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(saves).toEqual(['Mina', 'Mina Patel'])
  })

  test('rolls back to the last saved fill when the host rejects', async () => {
    const time = scheduler()
    const rolled: Fill[] = []
    const failures: string[] = []
    const queue = new FillSaveQueue(
      async () => {
        throw new Error('Offline')
      },
      (fill) => rolled.push(fill),
      (_id, error) => failures.push(error instanceof Error ? error.message : String(error)),
      time,
    )
    queue.seed({ id: 'mina', values: { name: 'Old' } })
    queue.edit({ id: 'mina', values: { name: 'New' } })
    expect(await queue.flush('mina')).toBe(false)
    expect(rolled).toEqual([{ id: 'mina', values: { name: 'Old' } }])
    expect(failures).toEqual(['Offline'])
  })

  test('flush waits for an in-flight save and the coalesced follow-up', async () => {
    const time = scheduler()
    const saves: string[] = []
    const releases: Array<() => void> = []
    const queue = new FillSaveQueue(
      (fill) => {
        saves.push(String(fill.values.name))
        return new Promise<void>((resolve) => releases.push(resolve))
      },
      () => {},
      () => {},
      time,
    )
    queue.seed(empty)
    queue.edit({ id: 'mina', values: { name: 'first' } })
    time.run()
    queue.edit({ id: 'mina', values: { name: 'final' } })
    let settled = false
    const flushing = queue.flushAll().then((ok) => {
      settled = true
      return ok
    })
    expect(saves).toEqual(['first'])
    expect(settled).toBe(false)
    releases[0]?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(saves).toEqual(['first', 'final'])
    releases[1]?.()
    expect(await flushing).toBe(true)
    expect(settled).toBe(true)
  })
})

import { describe, expect, test } from 'bun:test'
import type { BoardItem } from '@segnavia/format'
import { BoardNames } from './board-names.ts'

const a: BoardItem = { id: 'a', kind: 'page', address: 'one', x: 0, y: 0, width: 1 }
const b: BoardItem = { id: 'b', kind: 'page', address: 'two', x: 0, y: 0, width: 1 }
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('board names', () => {
  test('requests one batch per board value and skips named or in-flight addresses', async () => {
    const batches: BoardItem[][] = []
    let finish: ((value: Record<string, string>) => void) | undefined
    const provider = (items: BoardItem[]) => {
      batches.push(items)
      return new Promise<Record<string, string>>((resolve) => {
        finish = resolve
      })
    }
    const names = new BoardNames(
      () => {},
      () => {},
    )
    names.update([a, b], provider)
    names.update([a, b], provider)
    await settle()
    expect(batches).toEqual([[a, b]])
    finish?.({ a: 'A', b: 'B' })
    await settle()
    names.update([a, b], provider)
    await settle()
    expect(batches).toHaveLength(1)
  })

  test('ignores non-string, empty and unknown values and follows fallback order', async () => {
    const names = new BoardNames(
      () => {},
      () => {},
    )
    names.update([a, b], async () => ({ a: 'Host', b: 42, unknown: 'No', empty: '' }) as unknown as Record<string, string>)
    await settle()
    expect(names.name(a, { kind: 'page', page: {} as never, size: { width: 1, height: 1 }, title: 'Resolved' })).toBe('Host')
    expect(names.name(b, { kind: 'page', page: {} as never, size: { width: 1, height: 1 }, title: 'Resolved' })).toBe('Resolved')
    expect(names.name(undefined, undefined)).toBe('')
  })

  test('does not retry a rejected batch', async () => {
    let calls = 0
    const errors: unknown[] = []
    const names = new BoardNames(
      () => {},
      (_items, error) => errors.push(error),
    )
    const provider = async () => {
      calls += 1
      throw new Error('failed')
    }
    names.update([a], provider)
    await settle()
    names.update([a], provider)
    await settle()
    expect(calls).toBe(1)
    expect(errors).toHaveLength(1)
  })

  test('drops a cached name when its address leaves the board', async () => {
    const names = new BoardNames(
      () => {},
      () => {},
    )
    names.update([a], async () => ({ a: 'Host' }))
    await settle()
    expect(names.name(a, undefined)).toBe('Host')
    names.update([], undefined)
    expect(names.name(a, undefined)).toBe('')
  })
})

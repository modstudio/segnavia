import { describe, expect, test } from 'bun:test'
import type { BoardItem } from '@segnavia/format'
import { boardListing } from '@segnavia/format'
import { BoardNames } from './board-names.ts'
import type { BoardResolutionOutcome } from './board-resolutions.ts'

const a: BoardItem = { id: 'a', kind: 'page', address: 'one', x: 0, y: 0, width: 1 }
const b: BoardItem = { id: 'b', kind: 'page', address: 'two', x: 0, y: 0, width: 1 }
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
const pending: BoardResolutionOutcome = { status: 'pending' }
const resolved = (value: Extract<BoardResolutionOutcome, { status: 'resolved' }>['value']): BoardResolutionOutcome => ({ status: 'resolved', value })

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
    expect(names.name(a, resolved({ kind: 'page', page: {} as never, size: { width: 1, height: 1 }, title: 'Resolved' }))).toBe('Host')
    expect(names.name(b, resolved({ kind: 'page', page: {} as never, size: { width: 1, height: 1 }, title: 'Resolved' }))).toBe('Resolved')
    expect(names.name(undefined, pending)).toBe('')
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
    expect(names.name(a, pending)).toBe('Host')
    names.update([], undefined)
    expect(names.name(a, pending)).toBe('')
  })

  test('discards an old provider result and requests current items from the new provider', async () => {
    let finishOld: ((value: Record<string, string>) => void) | undefined
    let newCalls = 0
    const oldProvider = () =>
      new Promise<Record<string, string>>((resolve) => {
        finishOld = resolve
      })
    const newProvider = async () => {
      newCalls += 1
      return { a: 'New' }
    }
    const names = new BoardNames(
      () => {},
      () => {},
    )
    names.update([a], oldProvider)
    await settle()
    names.update([a], newProvider)
    await settle()
    finishOld?.({ a: 'Old' })
    await settle()
    expect(newCalls).toBe(1)
    expect(names.name(a, pending)).toBe('New')
  })

  test('never exposes a host name or resolved title for an unavailable item', async () => {
    const names = new BoardNames(
      () => {},
      () => {},
    )
    names.update([a], async () => ({ a: 'Secret' }))
    await settle()
    const labeled: BoardResolutionOutcome = { status: 'unavailable', value: { kind: 'page', state: 'withheld', label: 'Restricted' } }
    const unlabeled: BoardResolutionOutcome = { status: 'unavailable', value: { kind: 'page', state: 'gone' } }
    expect(names.name(a, labeled)).toBe('Restricted')
    expect(names.name(a, unlabeled)).toBe('')

    const board = {
      items: [a],
      labels: [],
      sections: [],
    } as never
    expect(boardListing(board, (item) => names.name(item, labeled), '', [])[0]?.items.map((item) => names.name(item, labeled))).toEqual(['Restricted'])
    expect(boardListing(board, (item) => names.name(item, labeled), 'Secret', [])).toEqual([])
  })

  test('drops failed and cached names at the requested addresses', async () => {
    let calls = 0
    let changes = 0
    const names = new BoardNames(
      () => {
        changes += 1
      },
      () => {},
    )
    const provider = async (items: BoardItem[]) => {
      calls += 1
      if (items.some((item) => item.id === 'a') && calls === 2) throw new Error('failed')
      return Object.fromEntries(items.map((item) => [item.id, item.id === 'a' ? 'Restored' : 'Kept']))
    }
    names.update([b], provider)
    await settle()
    names.update([a, b], provider)
    await settle()
    names.drop(['one', 'two'])
    names.update([a, b], provider)
    await settle()
    expect(calls).toBe(3)
    expect(names.name(a, pending)).toBe('Restored')
    expect(names.name(b, pending)).toBe('Kept')
    expect(changes).toBe(3)
  })
})

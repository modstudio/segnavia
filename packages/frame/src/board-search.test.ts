import { expect, test } from 'bun:test'
import { BoardSearchPolicy } from './board-search.ts'

test('a result for an older search is ignored', () => {
  const policy = new BoardSearchPolicy()
  const older = policy.begin()
  const current = policy.begin()
  expect(older.signal.aborted).toBe(true)
  expect(policy.accepts(older.version)).toBe(false)
  expect(policy.accepts(current.version)).toBe(true)
  policy.clear()
  expect(policy.accepts(current.version)).toBe(false)
})

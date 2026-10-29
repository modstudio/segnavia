import { describe, expect, test } from 'bun:test'
import { stageRebuildAction } from './stage-rebuild.ts'

describe('stage rebuild decision', () => {
  test.each([
    [true, true, true, 'refresh'],
    [false, true, true, 'update'],
    [true, false, true, 'update'],
    [true, true, false, 'update'],
    [false, false, true, 'update'],
    [false, true, false, 'update'],
    [true, false, false, 'update'],
    [false, false, false, 'update'],
  ] as const)('same controller %s, mounted frame %s, resolver %s chooses %s', (sameController, mounted, resolves, action) => {
    expect(stageRebuildAction(sameController, mounted, resolves)).toBe(action)
  })
})

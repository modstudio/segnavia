import { describe, expect, test } from 'bun:test'
import { hostNamesFile } from './host-names.ts'

const root = '/repo/worktrees/worker'
const commonDir = '/repo/.git'
const local = '/repo/worktrees/worker/host-names.local'
const main = '/repo/host-names.local'

describe('host-name file lookup', () => {
  test('uses the worker tree file when it exists', () => {
    expect(hostNamesFile(root, commonDir, (file) => file === local || file === main)).toBe(local)
  })

  test('falls back to the main checkout file', () => {
    expect(hostNamesFile(root, commonDir, (file) => file === main)).toBe(main)
  })

  test('returns nothing when neither file exists', () => {
    expect(hostNamesFile(root, commonDir, () => false)).toBeUndefined()
  })
})

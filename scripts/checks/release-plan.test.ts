import { describe, expect, test } from 'bun:test'
import { checkReleasePlan } from './release-plan.ts'

describe('release plan', () => {
  test('refuses a derived major beyond a declared minor', () => {
    expect(
      checkReleasePlan(
        [{ releases: [{ name: '@segnavia/editor', type: 'minor' }] }],
        [
          { name: '@segnavia/editor', type: 'minor' },
          { name: '@segnavia/react', type: 'major' },
        ],
      ),
    ).toEqual([{ name: '@segnavia/react', planned: 'major', declaredMaximum: 'minor' }])
  })

  test('allows a fixed-group minor for a package without its own changeset', () => {
    expect(
      checkReleasePlan(
        [{ releases: [{ name: '@segnavia/editor', type: 'minor' }] }],
        [
          { name: '@segnavia/editor', type: 'minor' },
          { name: '@segnavia/frame', type: 'minor' },
        ],
      ),
    ).toEqual([])
  })
})

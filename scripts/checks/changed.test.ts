import { describe, expect, test } from 'bun:test'
import { PACKAGES } from '../../architecture.ts'
import { selectChangedTests } from './changed.ts'

describe('changed test selection', () => {
  test('a format change selects format and all of its dependents', () => {
    expect(selectChangedTests(['packages/format/src/index.ts'], PACKAGES).packages).toEqual(['format', 'html', 'frame', 'react', 'voice', 'render', 'capture'])
  })

  test('a docs-only change selects no tests', () => {
    expect(selectChangedTests(['README.md', 'docs/continuous-integration.md'], PACKAGES)).toEqual({
      packages: [],
      scripts: false,
      packageChecks: false,
    })
  })
})

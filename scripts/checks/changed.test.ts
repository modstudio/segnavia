import { describe, expect, test } from 'bun:test'
import { PACKAGES } from '../../architecture.ts'
import { selectChangedTests } from './changed.ts'

describe('changed test selection', () => {
  test('a format change selects format and all of its dependents', () => {
    expect(selectChangedTests(['packages/format/src/index.ts'], PACKAGES).packages).toEqual([
      'format',
      'html',
      'idml',
      'frame',
      'react',
      'voice',
      'render',
      'capture',
    ])
  })

  test('both paths of a package move select their packages and dependents', () => {
    expect(selectChangedTests(['packages/html/src/moved.ts', 'packages/voice/src/moved.ts'], PACKAGES)).toEqual({
      packages: ['html', 'idml', 'frame', 'react', 'voice', 'render', 'capture'],
      scripts: true,
      packageChecks: false,
    })
  })

  test.each(['bun.lock', 'tsconfig.json', 'biome.json', 'package.json'])('%s selects every package and script tests', (file) => {
    expect(selectChangedTests([file], PACKAGES)).toEqual({
      packages: Object.keys(PACKAGES),
      scripts: true,
      packageChecks: file === 'package.json',
    })
  })

  test('a package source change selects script tests', () => {
    expect(selectChangedTests(['packages/render/src/color/index.ts'], PACKAGES).scripts).toBe(true)
  })

  test('a docs-only change selects no tests', () => {
    expect(selectChangedTests(['README.md', 'docs/continuous-integration.md'], PACKAGES)).toEqual({
      packages: [],
      scripts: false,
      packageChecks: false,
    })
  })
})

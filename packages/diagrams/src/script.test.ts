import { describe, expect, test } from 'bun:test'
import { diagramScript } from './script.ts'

describe('diagram drawing runtime', () => {
  test('is valid JavaScript after the bundle and adapter are assembled', () => {
    expect(() => new Function(diagramScript)).not.toThrow()
  })
})

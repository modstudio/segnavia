import { describe, expect, test } from 'bun:test'
import { diagramProviderScript } from './script.ts'

describe('diagram drawing runtime', () => {
  test('is valid JavaScript after the bundle and adapter are assembled', () => {
    expect(() => new Function(diagramProviderScript)).not.toThrow()
  })
})

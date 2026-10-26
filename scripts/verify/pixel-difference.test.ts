import { describe, expect, test } from 'bun:test'
import { differencePixels } from './pixel-difference.ts'

describe('masked difference', () => {
  test('scores the true difference inside the mask and zero outside it', () => {
    const reference = new Uint8Array(12)
    const actual = Uint8Array.from([0, 0, 0, 10, 20, 30, 0, 0, 0, 0, 0, 0])
    const mask = Uint8Array.from([0, 1, 0, 0])
    expect(differencePixels(reference, actual, 2, 2, mask, true)).toEqual({ mean: 20, p99: 30 })
    expect(differencePixels(reference, actual, 2, 2, mask, false)).toEqual({ mean: 0, p99: 0 })
  })
})

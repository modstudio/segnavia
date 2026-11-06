import { describe, expect, test } from 'bun:test'
import { physicalMargins } from './margins.ts'

const margin = { blockStart: 1, blockEnd: 2, inlineStart: 3, inlineEnd: 4 }

describe('physicalMargins', () => {
  test.each([
    ['ltr', 'recto', { top: 1, right: 4, bottom: 2, left: 3 }],
    ['ltr', 'verso', { top: 1, right: 3, bottom: 2, left: 4 }],
    ['rtl', 'recto', { top: 1, right: 3, bottom: 2, left: 4 }],
    ['rtl', 'verso', { top: 1, right: 4, bottom: 2, left: 3 }],
  ] as const)('maps %s %s binding and outer margins', (direction, side, expected) => {
    expect(physicalMargins(margin, direction, side)).toEqual(expected)
  })
})

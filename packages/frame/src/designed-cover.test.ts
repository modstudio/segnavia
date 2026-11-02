import { describe, expect, test } from 'bun:test'
import { fitDesignedCover } from './fit.ts'

describe('designed cover layout', () => {
  test.each([
    [
      { width: 100, height: 100 },
      { width: 100, height: 200 },
      { scale: 0.5, width: 50, height: 100 },
    ],
    [
      { width: 100, height: 100 },
      { width: 200, height: 100 },
      { scale: 0.5, width: 100, height: 50 },
    ],
    [
      { width: 400, height: 300 },
      { width: 100, height: 100 },
      { scale: 3, width: 300, height: 300 },
    ],
  ])('scales a $sheet.width by $sheet.height sheet uniformly inside its tile', (tile, sheet, expected) => {
    expect(fitDesignedCover(tile, sheet)).toEqual(expected)
  })
})

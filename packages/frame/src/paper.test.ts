import { describe, expect, test } from 'bun:test'
import { clampPaper, paperBoxSize, paperScale } from './paper-geometry.ts'

describe('paper geometry', () => {
  test('clamps a paper index to an available paper', () => {
    expect(clampPaper(-2, 2)).toBe(0)
    expect(clampPaper(1, 2)).toBe(1)
    expect(clampPaper(20, 2)).toBe(1)
    expect(clampPaper(2.8, 4)).toBe(2)
    expect(clampPaper(Number.NaN, 2)).toBe(0)
  })

  test('scales a paper down and up to its container width', () => {
    expect(paperScale(200, 400)).toBe(0.5)
    expect(paperScale(800, 400)).toBe(2)
  })

  test('converts a physical paper box to CSS pixels', () => {
    expect(paperBoxSize({ width: 25.4, height: 50.8 })).toEqual({ width: 96, height: 192 })
  })
})

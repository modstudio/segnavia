import { describe, expect, test } from 'bun:test'
import { CHROMIUM_MAX_SHRINK, type ScaleMeasurement, solveScale } from './overflow.ts'

function solved(pageWidth: number, widthAt: (layoutWidth: number) => number): { scale: number; layouts: number[] } {
  const measurements: ScaleMeasurement[] = []
  const layouts: number[] = []
  while (true) {
    const decision = solveScale(pageWidth, measurements)
    if ('scale' in decision) return { scale: decision.scale, layouts }
    layouts.push(decision.measure)
    measurements.push({ layoutWidth: decision.measure, contentWidth: widthAt(decision.measure) })
  }
}

describe('print overflow solved scale', () => {
  test('keeps scale one without rightward overflow', () => {
    expect(solved(400, (layout) => layout)).toEqual({ scale: 1, layouts: [400] })
  })

  test('uses the exact Chromium cap for fixed overflow', () => {
    expect(solved(400, () => 1200).scale).toBe(CHROMIUM_MAX_SHRINK)
  })

  test('solves page-relative overflow', () => {
    expect(solved(400, (layout) => layout + 20).scale).toBeCloseTo(400 / 380)
  })

  test('solves mixed fixed and page-relative overflow', () => {
    const result = solved(400, (layout) => Math.max(500, layout + 120))
    expect(result.scale).toBe(CHROMIUM_MAX_SHRINK)
    expect(result.layouts.length).toBeLessThanOrEqual(Math.ceil(Math.log2(400)) + 2)
  })
})

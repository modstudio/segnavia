import { describe, expect, test } from 'bun:test'
import { ACCEPTANCE_BARS, judgePress } from './config.ts'

describe('press acceptance', () => {
  test('chooses the strict bar for controls and the regression ceiling for effects', () => {
    const difference = { mean: 5, p99: 50 }
    expect(judgePress('control', difference)).toBeFalse()
    expect(judgePress('effects', difference)).toBeTrue()
  })
})

test('a backdrop raster exempts only the size multiple', () => {
  const size = ACCEPTANCE_BARS.find((bar) => bar.id === 'size')
  if (!size) throw new Error('The size bar is missing.')
  const facts = { rasterEffects: 2 } as never
  expect(size.pass({ pdfBytes: 499_999, effectlessPdfBytes: 100_000, multiple: 5, rasterEffects: 2 }, facts)).toBeTrue()
  expect(size.pass({ pdfBytes: 500_001, effectlessPdfBytes: 100_000, multiple: 5, rasterEffects: 2 }, facts)).toBeFalse()
  expect(size.reason({ pdfBytes: 499_999, effectlessPdfBytes: 100_000, multiple: 5, rasterEffects: 2 }, facts)).toContain('500,000-byte cap')
})

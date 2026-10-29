import { expect, test } from 'bun:test'
import { ReportCollector } from './report.ts'
import { resolveSwatchColor } from './swatch-color.ts'
import type { IdmlSwatch } from './types.ts'

const swatches: IdmlSwatch[] = [
  { id: 'cmyk', name: 'Process', model: 'cmyk', values: [50, 50, 0, 80] },
  { id: 'rgb', name: 'Rounded', model: 'rgb', values: [12.75, 13.2, 27.8] },
  { id: 'spot', name: 'Brand', model: 'spot', values: [1] },
]

test('resolves process, built-in, none, and rounded RGB swatches', () => {
  const report = new ReportCollector()
  expect(resolveSwatchColor('cmyk', swatches, report, 'art', 'fill')).toBe('rgb(26 26 51)')
  expect(resolveSwatchColor('Swatch/Black', swatches, report, 'art', 'fill')).toBe('#000')
  expect(resolveSwatchColor('Swatch/Paper', swatches, report, 'art', 'fill')).toBe('#fff')
  expect(resolveSwatchColor('Swatch/None', swatches, report, 'art', 'fill')).toBe('none')
  expect(resolveSwatchColor('rgb', swatches, report, 'art', 'fill')).toBe('rgb(13 13 28)')
})

test('reports an unresolved spot and keeps art visible with currentColor', () => {
  const report = new ReportCollector()
  expect(resolveSwatchColor('spot', swatches, report, 'polygon', 'fill')).toBe('currentColor')
  expect(resolveSwatchColor('spot', swatches, report, 'text', 'text')).toBeUndefined()
  expect(report.data().spotColors).toEqual({ Brand: 2 })
  expect(resolveSwatchColor('missing', swatches, report, 'polygon', 'fill')).toBe('currentColor')
  expect(report.data().unsupportedStyleProperties).toEqual({ 'FillColor:missing': 1 })
})

import { expect, test } from 'bun:test'
import { pageFitLayout, pageSheetLayout } from './page-layout.ts'

test.each([
  ['standard', 1024],
  ['wide', 1440],
] as const)('%s supplies the inline geometry mount applies', (width, measure) => {
  expect(pageSheetLayout({ width, height: 'auto' })).toEqual({ inlineSize: '100%', maxInlineSize: measure, marginInline: 'auto' })
})

test('an override supplies the named cap', () => {
  expect(pageSheetLayout({ width: 'standard', height: 'auto' }, { standard: 900 })).toEqual({
    inlineSize: '100%',
    maxInlineSize: 900,
    marginInline: 'auto',
  })
})

test('an exact width stays exact and full follows the available inline size', () => {
  expect(pageSheetLayout({ width: 600, height: 'auto' })).toEqual({ inlineSize: '600px' })
  expect(pageSheetLayout({ width: 'full', height: 'auto' })).toEqual({ inlineSize: '100%' })
})

test('fit geometry preserves bounded fluid and scaled fixed pages', () => {
  expect(pageFitLayout({ width: 'full', height: 'auto' }, true, 500, 240)).toEqual({
    sheetHeight: '100%',
    transform: '',
    hostHeight: '',
    measuredHeight: 240,
  })
  expect(pageFitLayout({ width: 1000, height: 500 }, false, 500, 400)).toEqual({
    sheetHeight: '400px',
    transform: 'scale(0.5)',
    hostHeight: '200px',
    measuredHeight: 400,
  })
})

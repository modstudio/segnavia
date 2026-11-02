import { expect, test } from 'bun:test'
import { pageSheetLayout } from './page-layout.ts'

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

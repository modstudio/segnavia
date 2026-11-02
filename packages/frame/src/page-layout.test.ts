import { expect, test } from 'bun:test'
import { pageSheetLayout } from './page-layout.ts'

test.each([
  ['standard', 1024],
  ['wide', 1440],
] as const)('%s caps and centers above its measure', (width, measure) => {
  expect(pageSheetLayout({ width, height: 'auto' }, 1800)).toEqual({ inlineSize: measure, inlineStart: (1800 - measure) / 2, maxInlineSize: measure })
})

test.each(['standard', 'wide'] as const)('%s reflows below its measure', (width) => {
  expect(pageSheetLayout({ width, height: 'auto' }, 800)).toMatchObject({ inlineSize: 800, inlineStart: 0 })
})

test('an override supplies the named cap', () => {
  expect(pageSheetLayout({ width: 'standard', height: 'auto' }, 1200, { standard: 900 })).toEqual({
    inlineSize: 900,
    inlineStart: 150,
    maxInlineSize: 900,
  })
})

test('an exact width stays exact and full follows the available inline size', () => {
  expect(pageSheetLayout({ width: 600, height: 'auto' }, 500)).toEqual({ inlineSize: 600, inlineStart: 0 })
  expect(pageSheetLayout({ width: 'full', height: 'auto' }, 1800)).toEqual({ inlineSize: 1800, inlineStart: 0 })
})

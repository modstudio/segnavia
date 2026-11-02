import { describe, expect, test } from 'bun:test'
import { PAGE_WIDTHS, Page, PageSize, PageWidths, resolvePageWidth } from './page.ts'

describe('PageSize', () => {
  test.each(['full', 'standard', 'wide'] as const)('parses the %s flowing width', (width) => {
    expect(PageSize.parse({ width, height: 'auto' })).toEqual({ width, height: 'auto' })
  })

  test('parses an exact flowing width', () => {
    expect(PageSize.parse({ width: 600, height: 'auto' })).toEqual({ width: 600, height: 'auto' })
  })

  test('reads legacy fluid pages as full', () => {
    expect(Page.parse({ html: '<p>Legacy</p>', size: 'fluid' }).size).toEqual({ width: 'full', height: 'auto' })
    expect(Page.parse({ html: '<p>Default</p>' }).size).toEqual({ width: 'full', height: 'auto' })
  })

  test('keeps fixed and exact flowing page shapes', () => {
    expect(PageSize.parse({ width: 800, height: 600 })).toEqual({ width: 800, height: 600 })
    expect(PageSize.parse({ width: 800, height: 'auto' })).toEqual({ width: 800, height: 'auto' })
  })
})

describe('PageWidths', () => {
  test('accepts partial positive overrides', () => {
    expect(PageWidths.parse({ standard: 900 })).toEqual({ standard: 900 })
    expect(PageWidths.parse({ wide: 1200.5 })).toEqual({ wide: 1200.5 })
  })

  test.each([{ standard: 0 }, { wide: -1 }, { standard: Number.NaN }])('refuses invalid overrides', (value) => {
    expect(() => PageWidths.parse(value)).toThrow()
  })
})

describe('resolvePageWidth', () => {
  test('full has no measure and uses the standard viewport', () => {
    expect(resolvePageWidth({ width: 'full', height: 'auto' })).toEqual({ viewportWidth: PAGE_WIDTHS.standard })
    expect(resolvePageWidth({ width: 'full', height: 'auto' }, { standard: 900 })).toEqual({ viewportWidth: 900 })
  })

  test.each(['standard', 'wide'] as const)('%s uses its measure for the cap and viewport', (width) => {
    expect(resolvePageWidth({ width, height: 'auto' })).toEqual({ measure: PAGE_WIDTHS[width], viewportWidth: PAGE_WIDTHS[width] })
    expect(resolvePageWidth({ width, height: 'auto' }, { [width]: 900 })).toEqual({ measure: 900, viewportWidth: 900 })
  })

  test('numeric flowing and fixed pages use their exact width', () => {
    expect(resolvePageWidth({ width: 600, height: 'auto' }, { standard: 900, wide: 1200 })).toEqual({ measure: 600, viewportWidth: 600 })
    expect(resolvePageWidth({ width: 800, height: 600 }, { standard: 900 })).toEqual({ measure: 800, viewportWidth: 800 })
  })
})

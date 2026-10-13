import { describe, expect, test } from 'bun:test'
import { fitPage, Imposition, impose, MAX_IMPOSITION_CELLS, type Placement, PX_PER_MM, pagePlacementLayout } from './index.ts'

const parse = (overrides: Record<string, unknown> = {}) =>
  Imposition.parse({ paper: 'a4', columns: 2, rows: 2, cell: { width: 80, height: 120 }, ...overrides })

describe('imposition', () => {
  test('one-sided defaults preserve the existing placement shape and order', () => {
    const value = parse({ columns: 2, rows: 1, cell: { width: 80, height: 120 }, skip: 1 })
    expect(value).toMatchObject({ sides: 'one', flip: 'long' })
    expect(impose(value, 2)).toEqual({
      paper: { width: 210, height: 297 },
      papers: 2,
      sides: 1,
      placements: [
        expect.objectContaining({ paper: 0, page: 0, side: 'front', column: 1, row: 0 }),
        expect.objectContaining({ paper: 1, page: 1, side: 'front', column: 0, row: 0 }),
      ],
    })
  })

  test('a letter grid in inches fills in reading order and carries onto another paper', () => {
    const value = Imposition.parse({
      paper: 'letter',
      unit: 'in',
      margin: { top: 0.5, left: 0.1875 },
      columns: 3,
      rows: 10,
      cell: { width: 2.625, height: 1 },
      gap: { column: 0.125 },
    })
    const imposed = impose(value, 30)
    expect(imposed.paper).toEqual({ width: 215.9, height: 279.4 })
    expect(imposed.papers).toBe(1)
    expect(imposed.placements).toHaveLength(30)
    expect(imposed.placements[0]?.trim).toEqual({ x: 4.76, y: 12.7, width: 66.68, height: 25.4 })
    expect(imposed.placements[16]?.trim).toEqual({ x: 74.61, y: 139.7, width: 66.68, height: 25.4 })
    expect(imposed.placements[29]?.trim).toEqual({ x: 144.46, y: 241.3, width: 66.68, height: 25.4 })
    expect(impose(value, 31).papers).toBe(2)
  })

  test('right-to-left direction mirrors column order while x stays physical', () => {
    const placements = impose(parse({ columns: 3, rows: 1, cell: { width: 50, height: 100 }, margin: { left: 10, right: 10 }, dir: 'rtl' }), 3).placements
    expect(placements.map(({ column, trim }) => ({ column, x: trim.x }))).toEqual([
      { column: 0, x: 150 },
      { column: 1, x: 100 },
      { column: 2, x: 50 },
    ])
  })

  test('right-to-left direction anchors a narrow grid at the right margin', () => {
    const placements = impose(
      parse({
        paper: { width: 100, height: 200, unit: 'mm' },
        columns: 3,
        rows: 1,
        cell: { width: 20, height: 100 },
        margin: { left: 7, right: 11 },
        gap: { column: 5 },
        bleed: 20,
        dir: 'rtl',
      }),
      3,
    ).placements
    expect(placements[0]).toMatchObject({ column: 0, trim: { x: 69 }, bleed: { right: 11, left: 2.5 } })
    expect(placements[2]).toMatchObject({ column: 2, trim: { x: 19 }, bleed: { right: 2.5, left: 19 } })
  })

  test('bleed stops halfway through gaps, at touching rows and at paper edges', () => {
    const placements = impose(
      parse({
        paper: { width: 28, height: 20, unit: 'mm' },
        orientation: 'landscape',
        columns: 2,
        rows: 2,
        cell: { width: 10, height: 10 },
        margin: { left: 1, right: 3 },
        gap: { column: 4, row: 0 },
        bleed: 3,
      }),
      4,
    ).placements
    expect(placements[0]).toMatchObject({
      bleed: { top: 0, right: 2, bottom: 0, left: 1 },
      clipped: ['top', 'right', 'bottom', 'left'],
    })
    expect(placements[3]).toMatchObject({
      bleed: { top: 0, right: 3, bottom: 0, left: 2 },
      clipped: ['top', 'bottom', 'left'],
    })
  })

  test('skip affects only the first paper', () => {
    const placements = impose(parse({ columns: 2, rows: 2, cell: { width: 80, height: 120 }, skip: 2 }), 4).placements
    expect(placements.map(({ paper, page, column, row }) => ({ paper, page, column, row }))).toEqual([
      { paper: 0, page: 0, column: 0, row: 1 },
      { paper: 0, page: 1, column: 1, row: 1 },
      { paper: 1, page: 2, column: 0, row: 0 },
      { paper: 1, page: 3, column: 1, row: 0 },
    ])
  })

  test('repeat gives each page every cell of its own paper', () => {
    const placements = impose(parse({ fill: 'repeat', skip: 1 }), 2).placements
    expect(placements.map(({ paper, page, column, row }) => ({ paper, page, column, row }))).toEqual([
      { paper: 0, page: 0, column: 1, row: 0 },
      { paper: 0, page: 0, column: 0, row: 1 },
      { paper: 0, page: 0, column: 1, row: 1 },
      { paper: 1, page: 1, column: 0, row: 0 },
      { paper: 1, page: 1, column: 1, row: 0 },
      { paper: 1, page: 1, column: 0, row: 1 },
      { paper: 1, page: 1, column: 1, row: 1 },
    ])
  })

  test('two-sided sequence pairs pages in cells and leaves the last back empty', () => {
    const imposed = impose(parse({ columns: 2, rows: 1, cell: { width: 80, height: 120 }, sides: 'two' }), 5)
    expect(imposed).toMatchObject({ papers: 2, sides: 2 })
    expect(imposed.placements.map(({ paper, side, page, column }) => ({ paper, side, page, column }))).toEqual([
      { paper: 0, side: 'front', page: 0, column: 0 },
      { paper: 0, side: 'front', page: 2, column: 1 },
      { paper: 0, side: 'back', page: 1, column: 0 },
      { paper: 0, side: 'back', page: 3, column: 1 },
      { paper: 1, side: 'front', page: 4, column: 0 },
    ])
  })

  test('two-sided repeat gives each pair a paper and leaves an odd pair back empty', () => {
    const imposed = impose(parse({ columns: 2, rows: 1, cell: { width: 80, height: 120 }, fill: 'repeat', sides: 'two' }), 3)
    expect(imposed).toMatchObject({ papers: 2, sides: 2 })
    expect(imposed.placements.map(({ paper, side, page }) => ({ paper, side, page }))).toEqual([
      { paper: 0, side: 'front', page: 0 },
      { paper: 0, side: 'front', page: 0 },
      { paper: 0, side: 'back', page: 1 },
      { paper: 0, side: 'back', page: 1 },
      { paper: 1, side: 'front', page: 2 },
      { paper: 1, side: 'front', page: 2 },
    ])
  })

  test('two-sided skip leaves the same physical cells empty on both sides', () => {
    const placements = impose(parse({ columns: 2, rows: 2, cell: { width: 80, height: 120 }, sides: 'two', skip: 2 }), 4).placements
    expect(placements.map(({ side, page, column, row }) => ({ side, page, column, row }))).toEqual([
      { side: 'front', page: 0, column: 0, row: 1 },
      { side: 'front', page: 2, column: 1, row: 1 },
      { side: 'back', page: 1, column: 0, row: 1 },
      { side: 'back', page: 3, column: 1, row: 1 },
    ])
  })

  test('zero pages needs no paper or placements', () => {
    expect(impose(parse(), 0)).toMatchObject({ papers: 0, placements: [] })
  })

  test('accepts exactly the cell ceiling', () => {
    expect(
      Imposition.parse({
        paper: { width: 10, height: 1, unit: 'mm' },
        orientation: 'landscape',
        columns: MAX_IMPOSITION_CELLS,
        rows: 1,
        cell: { width: 0.001, height: 1 },
      }),
    ).toMatchObject({ columns: 10_000, rows: 1 })
  })

  test('refuses a grid over the cell ceiling with both counts', () => {
    const result = Imposition.safeParse({
      paper: { width: 10.001, height: 1, unit: 'mm' },
      columns: MAX_IMPOSITION_CELLS + 1,
      rows: 1,
      cell: { width: 0.001, height: 1 },
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.message).join(' ')).toContain('10001 cells')
    expect(result.error?.issues.map((issue) => issue.message).join(' ')).toContain('ceiling is 10000')
  })

  test('refuses a huge factor before impose can allocate placements', () => {
    const result = Imposition.safeParse({
      paper: { width: Number.MAX_SAFE_INTEGER, height: 1, unit: 'mm' },
      columns: Number.MAX_SAFE_INTEGER,
      rows: 1,
      cell: { width: 1, height: 1 },
      fill: 'repeat',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues).toHaveLength(1)
    expect(result.error?.issues[0]?.message).toContain(`${Number.MAX_SAFE_INTEGER} cells`)
  })

  test.each([
    [{ paper: { width: 100, height: 200, unit: 'mm' }, columns: 2, rows: 1, cell: { width: 51, height: 10 } }, ['102mm wide', '100mm wide', '2mm']],
    [{ paper: { width: 100, height: 100, unit: 'mm' }, columns: 1, rows: 2, cell: { width: 10, height: 51 } }, ['102mm high', '100mm high', '2mm']],
    [{ paper: 'a4', columns: 1, rows: 1, cell: { width: 20, height: 30 }, safe: 10 }, ['10mm', '20mm wide']],
    [{ paper: 'a4', columns: 2, rows: 2, cell: { width: 20, height: 30 }, skip: 4 }, ['skip is 4', '4 cells', 'less than 4']],
  ])('refuses invalid grid geometry with the offending numbers', (input, messages) => {
    const result = Imposition.safeParse(input)
    expect(result.success).toBe(false)
    for (const message of messages) expect(result.error?.issues.map((issue) => issue.message).join(' ')).toContain(message)
  })

  test('pageCount must be a nonnegative integer', () => {
    expect(() => impose(parse(), -1)).toThrow(RangeError)
    expect(() => impose(parse(), 1.5)).toThrow('1.5')
  })

  test('custom paper and grid lengths can both use points', () => {
    const value = Imposition.parse({
      paper: { width: 612, height: 792, unit: 'pt' },
      unit: 'pt',
      columns: 2,
      rows: 1,
      cell: { width: 288, height: 720 },
      gap: { column: 18 },
      margin: { left: 9, right: 9 },
    })
    expect(impose(value, 2)).toMatchObject({
      paper: { width: 215.9, height: 279.4 },
      placements: [{ trim: { x: 3.18, y: 0, width: 101.6, height: 254 } }, { trim: { x: 111.12, y: 0, width: 101.6, height: 254 } }],
    })
  })
})

const placement = (overrides: Partial<Placement> = {}): Placement => ({
  page: 0,
  paper: 0,
  side: 'front',
  column: 0,
  row: 0,
  trim: { x: 10, y: 20, width: 100, height: 50 },
  bleed: { top: 3, right: 3, bottom: 3, left: 3 },
  bleedBox: { x: 7, y: 17, width: 106, height: 56 },
  safeBox: { x: 15, y: 25, width: 90, height: 40 },
  clipped: [],
  ...overrides,
})

describe('fitPage', () => {
  test('fluid pages lay out at the bleed box width', () => {
    expect(fitPage({ size: 'fluid' }, placement(), 'contain')).toEqual({
      flow: true,
      width: 106 * PX_PER_MM,
      height: null,
      scale: 1,
      x: 7,
      y: 17,
      bands: { inline: 0, block: 0 },
      crop: { top: 0, right: 0, bottom: 0, left: 0 },
      differs: false,
    })
  })

  test('auto-height pages keep their own layout width and scale to trim', () => {
    const fit = fitPage({ size: { width: 400, height: 'auto' } }, placement(), 'contain')
    expect(fit).toMatchObject({ flow: true, width: 400, height: null, x: 10, y: 20, bands: { inline: 0, block: 0 } })
    expect(fit.scale).toBeCloseTo((100 * PX_PER_MM) / 400)
  })

  test('contain centers wide and tall pages with bands on the other axis', () => {
    expect(fitPage({ size: { width: 400, height: 100 } }, placement(), 'contain')).toMatchObject({ x: 10, y: 32.5, bands: { inline: 0, block: 12.5 } })
    expect(fitPage({ size: { width: 100, height: 400 } }, placement(), 'contain')).toMatchObject({ x: 53.75, y: 20, bands: { inline: 43.75, block: 0 } })
  })

  test('cover crops one axis and never stretches', () => {
    const result = fitPage({ size: { width: 400, height: 100 } }, placement(), 'cover')
    expect(result.crop.top).toBe(0)
    expect(result.crop.bottom).toBe(0)
    expect(result.crop.left).toBeGreaterThan(0)
    expect(result.crop.right).toBe(result.crop.left)
  })

  test('fixed pages may scale up', () => {
    expect(fitPage({ size: { width: 100, height: 50 } }, placement(), 'contain').scale).toBeCloseTo(PX_PER_MM)
  })

  test('differs compares a page print trim with the cell', () => {
    expect(
      fitPage(
        { size: 'fluid', print: { paper: { width: 100, height: 50, unit: 'mm' }, orientation: 'landscape', bleed: 0, safe: 0, marks: false } },
        placement(),
        'contain',
      ).differs,
    ).toBe(false)
    expect(fitPage({ size: 'fluid', print: { paper: 'a4', orientation: 'portrait', bleed: 0, safe: 0, marks: false } }, placement(), 'contain').differs).toBe(
      true,
    )
  })

  test('asymmetric cover stays centered on trim and covers every side of the bleed box', () => {
    const place = placement({ bleed: { top: 1, right: 2, bottom: 3, left: 4 }, bleedBox: { x: 6, y: 19, width: 106, height: 54 } })
    const result = fitPage({ size: { width: 100, height: 50 } }, place, 'cover')
    const width = (100 * result.scale) / PX_PER_MM
    const height = (50 * result.scale) / PX_PER_MM
    expect(result.x + width / 2).toBeCloseTo(place.trim.x + place.trim.width / 2)
    expect(result.y + height / 2).toBeCloseTo(place.trim.y + place.trim.height / 2)
    expect(result.x).toBeLessThanOrEqual(place.bleedBox.x)
    expect(result.y).toBeLessThanOrEqual(place.bleedBox.y)
    expect(result.x + width).toBeGreaterThanOrEqual(place.bleedBox.x + place.bleedBox.width)
    expect(result.y + height).toBeGreaterThanOrEqual(place.bleedBox.y + place.bleedBox.height)
    expect(result.crop).toEqual({ top: 2, right: 4, bottom: 0, left: 2 })
  })
})

describe('pagePlacementLayout', () => {
  test('a fluid piece fills the bleed box and insets its layout', () => {
    const place = placement({ bleed: { top: 1, right: 2, bottom: 3, left: 4 }, bleedBox: { x: 6, y: 19, width: 106, height: 54 } })
    const size = 'fluid' as const
    const layout = pagePlacementLayout(size, place, fitPage({ size }, place, 'contain'))
    expect(layout).toEqual({
      kind: 'fluid',
      piece: { width: 106 * PX_PER_MM, height: 54 * PX_PER_MM },
      inset: true,
      paper: place.bleedBox,
    })
  })

  test('a growing piece uses its own width and occupies the trim even with no left bleed', () => {
    const place = placement({ bleed: { top: 3, right: 4, bottom: 3, left: 0 }, bleedBox: { x: 10, y: 17, width: 104, height: 56 } })
    const size = { width: 400, height: 'auto' } as const
    const fit = fitPage({ size }, place, 'contain')
    expect(pagePlacementLayout(size, place, fit)).toEqual({
      kind: 'growing',
      piece: { width: 400, height: (place.trim.height * PX_PER_MM) / fit.scale },
      inset: false,
      paper: place.trim,
    })
  })

  test('a fixed piece keeps its CSS size and occupies its scaled fit rectangle', () => {
    const size = { width: 400, height: 100 } as const
    const place = placement()
    const fit = fitPage({ size }, place, 'contain')
    expect(pagePlacementLayout(size, place, fit)).toEqual({
      kind: 'fixed',
      piece: size,
      inset: false,
      paper: {
        x: fit.x,
        y: fit.y,
        width: (size.width * fit.scale) / PX_PER_MM,
        height: (size.height * fit.scale) / PX_PER_MM,
      },
    })
  })
})

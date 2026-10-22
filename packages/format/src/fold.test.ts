import { describe, expect, test } from 'bun:test'
import { FOLD_TUCK_IN_MM, foldPanelMap, Imposition, impose, MAX_IMPOSITION_CELLS, type Placement } from './index.ts'

const foldInput = (overrides: Record<string, unknown> = {}) => ({
  paper: { width: 300, height: 100, unit: 'mm' as const },
  orientation: 'landscape' as const,
  cell: { height: 100 },
  ...overrides,
})

const parseFold = (overrides: Record<string, unknown> = {}) => Imposition.parse(foldInput(overrides))

const byColumn = (placements: Placement[], side: Placement['side']) =>
  placements.filter((placement) => placement.side === side).sort((left, right) => left.column - right.column)

describe('foldPanelMap', () => {
  test.each([
    ['half', 2, { front: [4, 1], back: [2, 3] }],
    ['letter', 3, { front: [5, 6, 1], back: [2, 3, 4] }],
    ['z', 3, { front: [5, 6, 1], back: [2, 3, 4] }],
    ['gate', 3, { front: [2, 6, 1], back: [3, 4, 5] }],
    ['custom', 4, { front: [6, 7, 8, 1], back: [2, 3, 4, 5] }],
  ] as const)('%s lists author pages in logical column order', (fold, columns, map) => {
    expect(foldPanelMap(fold, columns)).toEqual({ front: [...map.front], back: [...map.back] })
  })
})

describe('folded imposition', () => {
  test.each(['ltr', 'rtl'] as const)('letter, z, gate, half and custom pair a0 with b-last in %s', (dir) => {
    const folds = [
      ['half', undefined],
      ['letter', undefined],
      ['z', undefined],
      ['gate', undefined],
      ['custom', [40, 80, 80, 100]],
    ] as const
    for (const [fold, panels] of folds) {
      const value = parseFold({ fold, dir, ...(panels ? { panels } : {}) })
      const map = foldPanelMap(fold, value.columns)
      const imposed = impose(value, value.columns * 2)
      const fronts = byColumn(imposed.placements, 'front')
      const backs = byColumn(imposed.placements, 'back')
      expect(fronts.map((placement) => placement.page + 1)).toEqual(map.front)
      expect(backs[0]?.page).toBe((map.back.at(-1) ?? 0) - 1)
      expect(backs.map((placement) => placement.page + 1)).toEqual([...map.back].reverse())
      expect(fronts[0]?.column).toBe(0)
      expect(backs[0]?.column).toBe(0)
      expect(fronts[0]?.trim.x).toBe(backs[0]?.trim.x)
      if (dir === 'ltr') expect(fronts[0]?.trim.x).toBeLessThan(fronts[1]?.trim.x ?? 0)
      else expect(fronts[0]?.trim.x).toBeGreaterThan(fronts[1]?.trim.x ?? 0)
    }
  })

  test('a letter fold narrows the tuck-in panel by the allowance', () => {
    const value = parseFold({ fold: 'letter' })
    expect(value.columns).toBe(3)
    expect(value.sides).toBe('two')
    expect(value.rows).toBe(1)
    expect(value.panels).toHaveLength(3)
    const [tuck, middle, end] = value.panels ?? []
    expect(tuck).toBeCloseTo(300 / 3 - FOLD_TUCK_IN_MM)
    expect((middle ?? 0) + (end ?? 0) + (tuck ?? 0)).toBeCloseTo(300)
    expect(tuck).toBeLessThan(middle ?? 0)
    const trims = byColumn(impose(value, 6).placements, 'front').map((placement) => placement.trim.width)
    expect(trims[0]).toBeCloseTo(tuck ?? 0)
    expect(trims[1]).toBeCloseTo(middle ?? 0)
    expect(trims[2]).toBeCloseTo(end ?? 0)
  })

  test('a gate fold narrows both outer flaps', () => {
    const value = parseFold({ fold: 'gate' })
    const [left, center, right] = value.panels ?? []
    expect(left).toBe(right)
    expect(left).toBeCloseTo(300 / 4 - FOLD_TUCK_IN_MM)
    expect((left ?? 0) + (center ?? 0) + (right ?? 0)).toBeCloseTo(300)
    expect(center).toBeGreaterThan((left ?? 0) * 2)
    const trims = byColumn(impose(value, 6).placements, 'front').map((placement) => placement.trim.width)
    expect(trims[0]).toBeCloseTo(left ?? 0)
    expect(trims[1]).toBeCloseTo(center ?? 0)
    expect(trims[2]).toBeCloseTo(right ?? 0)
  })

  test('a letter fold in inches still fills the sheet', () => {
    const value = Imposition.parse({
      paper: 'letter',
      orientation: 'landscape',
      unit: 'in',
      fold: 'letter',
      cell: { height: 8.5 },
    })
    expect(value.panels?.reduce((sum, width) => sum + width, 0)).toBeCloseTo(11)
  })

  test('z and half folds keep equal panels', () => {
    expect(parseFold({ fold: 'z' }).panels).toEqual([100, 100, 100])
    expect(parseFold({ fold: 'half' }).panels).toEqual([150, 150])
  })

  test('a host panel override is kept when it fills the paper', () => {
    const value = parseFold({ fold: 'letter', panels: [90, 110, 100] })
    expect(value.panels).toEqual([90, 110, 100])
    expect(byColumn(impose(value, 6).placements, 'front').map((placement) => placement.trim.width)).toEqual([90, 110, 100])
  })

  test('refuses a fold over the panel ceiling', () => {
    const result = Imposition.safeParse(foldInput({ fold: 'custom', panels: Array.from({ length: MAX_IMPOSITION_CELLS + 1 }, () => 0.01) }))
    expect(result.success).toBe(false)
    expect(result.error?.issues).toHaveLength(1)
    expect(result.error?.issues[0]?.message).toContain(`${MAX_IMPOSITION_CELLS + 1} panels`)
    expect(result.error?.issues[0]?.message).toContain(`ceiling is ${MAX_IMPOSITION_CELLS}`)
  })

  test('parse refuses a fold whose safe margin is too large for the tuck-in panel', () => {
    const result = Imposition.safeParse(foldInput({ fold: 'letter', safe: 50 }))
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path)).toContainEqual(['safe'])
  })

  test('parse refuses a fold taller than the paper with the fold height remedy', () => {
    const result = Imposition.safeParse(foldInput({ fold: 'letter', cell: { height: 120 } }))
    expect(result.success).toBe(false)
    const messages = result.error?.issues.map((issue) => issue.message).join(' ') ?? ''
    expect(messages).toContain('reduce the vertical margins or cell height')
    expect(messages).not.toContain('row gap')
  })

  test('parse refuses an over-wide fold with one width issue', () => {
    const result = Imposition.safeParse(foldInput({ fold: 'letter', panels: [120, 120, 120] }))
    expect(result.success).toBe(false)
    expect(result.error?.issues).toHaveLength(1)
    expect(result.error?.issues[0]).toMatchObject({ path: ['panels'] })
    expect(result.error?.issues[0]?.message).toContain('sum to 360mm')
  })

  test('impose refuses a folded piece with the wrong page count', () => {
    const value = parseFold({ fold: 'letter' })
    expect(() => impose(value, 5)).toThrow('this letter fold has 5 pages and needs 6 (2 × 3 panels); pass 6 pages to clear this refusal')
    expect(() => impose(value, 0)).toThrow('needs 6')
  })

  test('parse refuses a contradicting fold shape by name', () => {
    const rows = Imposition.safeParse(foldInput({ fold: 'letter', rows: 2 }))
    expect(rows.error?.issues[0]).toMatchObject({ path: ['rows'] })
    expect(rows.error?.issues[0]?.message).toContain('one row')
    const sides = Imposition.safeParse(foldInput({ fold: 'letter', sides: 'one' }))
    expect(sides.error?.issues[0]?.message).toContain('two-sided')
    const fill = Imposition.safeParse(foldInput({ fold: 'letter', fill: 'repeat' }))
    expect(fill.error?.issues[0]?.message).toContain('sequence')
    const skip = Imposition.safeParse(foldInput({ fold: 'letter', skip: 1 }))
    expect(skip.error?.issues[0]?.message).toContain('skip is 1')
    const gap = Imposition.safeParse(foldInput({ fold: 'letter', gap: { column: 2 } }))
    expect(gap.error?.issues[0]?.message).toContain('panels touch')
    const columns = Imposition.safeParse(foldInput({ fold: 'letter', columns: 4 }))
    expect(columns.error?.issues[0]?.message).toContain('3 panels')
  })

  test('parse refuses panel width mistakes by name', () => {
    const custom = Imposition.safeParse(foldInput({ fold: 'custom' }))
    expect(custom.error?.issues[0]?.message).toContain('at least two widths')
    const count = Imposition.safeParse(foldInput({ fold: 'letter', panels: [150, 150] }))
    expect(count.error?.issues[0]?.message).toContain('3 widths')
    const sum = Imposition.safeParse(foldInput({ fold: 'letter', panels: [90, 90, 90] }))
    expect(sum.error?.issues[0]?.message).toContain('sum to 270mm')
    expect(sum.error?.issues[0]?.message).toContain('300mm')
  })

  test('a grid still requires columns, rows and cell.width', () => {
    expect(Imposition.safeParse({ paper: 'a4', cell: { height: 20 } }).error?.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([['columns'], ['rows'], ['cell', 'width']]),
    )
  })
})

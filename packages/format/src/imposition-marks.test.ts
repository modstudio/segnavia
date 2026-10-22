import { describe, expect, test } from 'bun:test'
import { Imposition, impose, impositionMarks, type MarkSegment, type Placement } from './index.ts'

const markInput = (overrides: Record<string, unknown> = {}) =>
  Imposition.parse({
    paper: { width: 80, height: 100, unit: 'mm' },
    columns: 2,
    rows: 3,
    cell: { width: 20, height: 20 },
    margin: { top: 10, right: 10, bottom: 10, left: 10 },
    marks: true,
    ...overrides,
  })

const segmentIntersects = (mark: MarkSegment, box: Placement['bleedBox']) =>
  Math.max(mark.x1, box.x) <= Math.min(mark.x2, box.x + box.width) && Math.max(mark.y1, box.y) <= Math.min(mark.y2, box.y + box.height)

describe('impositionMarks', () => {
  test('a butted two by three grid has one pair per shared cut line', () => {
    const marks = impositionMarks(markInput())[0]?.marks ?? []
    expect(marks).toHaveLength(14)
    expect(
      marks
        .filter(({ x1, x2 }) => x1 === x2)
        .map(({ x1 }) => x1)
        .sort((a, b) => a - b),
    ).toEqual([10, 10, 30, 30, 50, 50])
  })

  test('a gap gives each of its two sides a separate pair', () => {
    const marks = impositionMarks(markInput({ gap: { column: 4, row: 6 } }))[0]?.marks ?? []
    expect(marks).toHaveLength(20)
    expect(
      marks
        .filter(({ x1, x2 }) => x1 === x2)
        .map(({ x1 }) => x1)
        .sort((a, b) => a - b),
    ).toEqual([10, 10, 30, 30, 34, 34, 54, 54])
  })

  test('a narrow margin shortens a mark and a margin below the minimum omits it', () => {
    const shortened = impositionMarks(markInput({ margin: { top: 4, right: 10, bottom: 10, left: 2.5 } }))[0]
    expect(shortened?.marks.some(({ y1, y2 }) => Math.abs(y2 - y1) === 3)).toBe(true)
    expect(shortened?.omittedMarks.some(({ edge }) => edge === 'left')).toBe(true)
  })

  test('generated grids never put a mark on a placement bleed, including RTL and zero gaps', () => {
    for (const dir of ['ltr', 'rtl'] as const) {
      for (const gap of [0, 4]) {
        for (const bleed of [0, 1]) {
          const imposition = markInput({ dir, gap: { column: gap, row: gap }, bleed })
          const placements = impose(imposition, imposition.columns * imposition.rows).placements
          for (const mark of impositionMarks(imposition)[0]?.marks ?? []) {
            expect(placements.some(({ bleedBox }) => segmentIntersects(mark, bleedBox))).toBe(false)
          }
        }
      }
    }
  })

  test.each(['long', 'short'] as const)('the flipped back mirrors the front for a %s-edge flip', (flip) => {
    const imposition = markInput({ sides: 'two', flip })
    const [front, back] = impositionMarks(imposition)
    const axis = flip === 'long' ? 'x' : 'y'
    const mirrored = front?.marks.map((mark) =>
      axis === 'x' ? { ...mark, x1: 80 - mark.x1, x2: 80 - mark.x2 } : { ...mark, y1: 100 - mark.y1, y2: 100 - mark.y2 },
    )
    expect(back?.marks).toEqual(mirrored)
  })

  test('corner marks are opt-in and never cross bleed', () => {
    const geometry = { paper: { width: 80, height: 120, unit: 'mm' as const }, gap: { column: 14, row: 14 } }
    const off = impositionMarks(markInput(geometry))[0]
    const input = markInput({ ...geometry, cornerMarks: true })
    const on = impositionMarks(input)[0]
    expect(on?.marks.length).toBeGreaterThan(off?.marks.length ?? 0)
    const placements = impose(input, input.columns * input.rows).placements
    for (const mark of on?.marks ?? []) expect(placements.some(({ bleedBox }) => segmentIntersects(mark, bleedBox))).toBe(false)
  })

  test('corner marks are refused by name unless marks are enabled', () => {
    const result = Imposition.safeParse({ paper: 'a4', columns: 1, rows: 1, cell: { width: 20, height: 20 }, cornerMarks: true })
    expect(result.error?.issues[0]).toMatchObject({ path: ['cornerMarks'] })
    expect(result.error?.issues[0]?.message).toContain('marks')
  })
})

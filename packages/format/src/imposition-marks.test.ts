import { describe, expect, test } from 'bun:test'
import { Imposition, impose, impositionMarks, type MarkSegment, mirrorPlacement, type OmittedImpositionMark, type Placement } from './index.ts'

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

const zeroEdges = { top: 0, right: 0, bottom: 0, left: 0 }

const boxPlacement = (trim: Placement['trim']): Placement => ({
  page: 0,
  paper: 0,
  side: 'front',
  column: 0,
  row: 0,
  trim,
  bleed: zeroEdges,
  bleedBox: trim,
  safeBox: trim,
  clipped: [],
})

// Canonical form so a segment matches its reverse.
const segmentKey = ({ x1, y1, x2, y2 }: MarkSegment) => {
  const start = `${x1},${y1}`
  const end = `${x2},${y2}`
  return start < end ? `${start}|${end}` : `${end}|${start}`
}

// Mirror a mark through mirrorPlacement so the flip axis is that function's rule, not a copy of it.
function mirrorMark(mark: MarkSegment, paper: { width: number; height: number }, flip: Imposition['flip']): MarkSegment {
  const trim = {
    x: Math.min(mark.x1, mark.x2),
    y: Math.min(mark.y1, mark.y2),
    width: Math.abs(mark.x2 - mark.x1),
    height: Math.abs(mark.y2 - mark.y1),
  }
  const mirrored = mirrorPlacement(boxPlacement(trim), paper, flip).trim
  return { x1: mirrored.x, y1: mirrored.y, x2: mirrored.x + mirrored.width, y2: mirrored.y + mirrored.height }
}

function mirrorOmitted(
  mark: OmittedImpositionMark,
  paper: { width: number; height: number },
  flip: Imposition['flip'],
): Pick<OmittedImpositionMark, 'edge' | 'cutPosition'> {
  const verticalCut = mark.edge === 'top' || mark.edge === 'bottom'
  const trim = verticalCut ? { x: mark.cutPosition, y: 0, width: 0, height: 0 } : { x: 0, y: mark.cutPosition, width: 0, height: 0 }
  const mirrored = mirrorPlacement({ ...boxPlacement(trim), clipped: [mark.edge] }, paper, flip)
  return { edge: mirrored.clipped[0] ?? mark.edge, cutPosition: verticalCut ? mirrored.trim.x : mirrored.trim.y }
}

const omittedKey = ({ edge, cutPosition }: Pick<OmittedImpositionMark, 'edge' | 'cutPosition'>) => `${edge}:${cutPosition}`

const cutOnTrim = (mark: MarkSegment, trims: Placement['trim'][]) => {
  const vertical = mark.x1 === mark.x2
  return trims.some((trim) => (vertical ? mark.x1 === trim.x || mark.x1 === trim.x + trim.width : mark.y1 === trim.y || mark.y1 === trim.y + trim.height))
}

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

  test.each([
    ['portrait', 'long', 0],
    ['portrait', 'long', 4],
    ['portrait', 'short', 0],
    ['portrait', 'short', 4],
    ['landscape', 'long', 0],
    ['landscape', 'long', 4],
    ['landscape', 'short', 0],
    ['landscape', 'short', 4],
  ] as const)('rtl two-sided %s %s-flip gap %i back marks lie behind the front', (orientation, flip, gap) => {
    const imposition = markInput({
      paper: { width: 100, height: 140, unit: 'mm' },
      orientation,
      sides: 'two',
      flip,
      dir: 'rtl',
      gap: { column: gap, row: gap },
      margin: { top: 2.5, right: 14, bottom: 11, left: 2.5 },
    })
    const [front, back] = impositionMarks(imposition)
    const cellCount = imposition.columns * imposition.rows
    const imposed = impose(imposition, cellCount * 2)
    const paper = imposed.paper
    const backTrims = imposed.placements.filter(({ side }) => side === 'back').map(({ trim }) => trim)
    expect(front?.side).toBe('front')
    expect(back?.side).toBe('back')
    expect(back?.marks.length).toBeGreaterThan(0)
    expect(back?.omittedMarks.length).toBeGreaterThan(0)
    expect((back?.marks ?? []).map((mark) => segmentKey(mirrorMark(mark, paper, flip))).sort()).toEqual((front?.marks ?? []).map(segmentKey).sort())
    expect((back?.omittedMarks ?? []).map((mark) => omittedKey(mirrorOmitted(mark, paper, flip))).sort()).toEqual(
      (front?.omittedMarks ?? []).map(omittedKey).sort(),
    )
    for (const mark of back?.marks ?? []) expect(cutOnTrim(mark, backTrims)).toBe(true)
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

  test('a fold draws dashed marks at folds and solid crop marks only at the outer edges', () => {
    const imposition = Imposition.parse({
      paper: { width: 300, height: 120, unit: 'mm' },
      orientation: 'landscape',
      fold: 'letter',
      cell: { height: 100 },
      margin: { top: 10, right: 0, bottom: 10, left: 0 },
      marks: true,
    })
    const [front, back] = impositionMarks(imposition)
    const dashed = (front?.marks ?? []).filter((mark) => mark.dashed)
    const solid = (front?.marks ?? []).filter((mark) => !mark.dashed)
    const placements = impose(imposition, 6).placements.filter((placement) => placement.side === 'front')
    const left = Math.min(...placements.map(({ trim }) => trim.x))
    const right = Math.max(...placements.map(({ trim }) => trim.x + trim.width))
    expect(dashed).toHaveLength(4)
    expect(solid.every((mark) => mark.x1 !== mark.x2 || mark.x1 === left || mark.x1 === right)).toBe(true)
    expect(dashed.every((mark) => mark.x1 === mark.x2 && mark.x1 > left && mark.x1 < right)).toBe(true)
    expect(back?.marks.filter((mark) => mark.dashed)).toHaveLength(4)
  })

  test('markColor defaults to black and is refused by name unless marks are enabled', () => {
    expect(markInput().markColor).toBe('black')
    expect(markInput({ markColor: 'registration' }).markColor).toBe('registration')
    const refused = Imposition.safeParse({ paper: 'a4', columns: 1, rows: 1, cell: { width: 20, height: 20 }, markColor: 'registration' })
    expect(refused.error?.issues[0]).toMatchObject({ path: ['markColor'] })
    expect(refused.error?.issues[0]?.message).toContain('marks')
  })
})

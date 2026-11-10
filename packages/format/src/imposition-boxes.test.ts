import { describe, expect, test } from 'bun:test'
import { gridPlacements } from './imposition.ts'
import { Imposition, impositionBoxes, impositionMarks, mirrorPlacement, type PaperBox } from './index.ts'

const union = (boxes: PaperBox[]): PaperBox => {
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  const bottom = Math.max(...boxes.map((box) => box.y + box.height))
  return { x, y, width: right - x, height: bottom - y }
}

const grid = (overrides: Record<string, unknown> = {}) =>
  Imposition.parse({
    paper: { width: 100, height: 80, unit: 'mm' },
    orientation: 'landscape',
    columns: 2,
    rows: 2,
    cell: { width: 30, height: 20 },
    margin: { top: 9, right: 12, bottom: 14, left: 7 },
    gap: { column: 8, row: 6 },
    ...overrides,
  })

describe('impositionBoxes', () => {
  test('unions the outer trim and realized bleed edges of a grid', () => {
    expect(impositionBoxes(grid(), { bleed: 3 })).toEqual([
      {
        side: 'front',
        trim: { x: 7, y: 9, width: 68, height: 46 },
        bleedBox: { x: 4, y: 6, width: 74, height: 52 },
      },
    ])
  })

  test('makes the bleed box equal the trim when there is no bleed', () => {
    const [front] = impositionBoxes(grid())
    expect(front?.bleedBox).toEqual(front?.trim)
  })

  test.each(['long', 'short'] as const)('mirrors an asymmetric grid onto the back for a %s-edge flip', (flip) => {
    const imposition = grid({ sides: 'two', flip })
    const { paper, placements } = gridPlacements(imposition, { bleed: 2 })
    const [front, back] = impositionBoxes(imposition, { bleed: 2 })
    const mirrored = placements.map((placement) => mirrorPlacement(placement, paper, flip))
    expect(front).toEqual({ side: 'front', trim: union(placements.map(({ trim }) => trim)), bleedBox: union(placements.map(({ bleedBox }) => bleedBox)) })
    expect(back).toEqual({ side: 'back', trim: union(mirrored.map(({ trim }) => trim)), bleedBox: union(mirrored.map(({ bleedBox }) => bleedBox)) })
    expect(back?.trim).not.toEqual(front?.trim)
  })

  test('a fold uses the bounds of its unequal panel cells', () => {
    const imposition = Imposition.parse({
      paper: { width: 300, height: 120, unit: 'mm' },
      orientation: 'landscape',
      fold: 'letter',
      cell: { height: 100 },
      margin: { top: 10, right: 0, bottom: 10, left: 0 },
    })
    const { placements } = gridPlacements(imposition, { bleed: 2 })
    const [front] = impositionBoxes(imposition, { bleed: 2 })
    expect(new Set(placements.map(({ trim }) => trim.width)).size).toBeGreaterThan(1)
    expect(front).toEqual({ side: 'front', trim: union(placements.map(({ trim }) => trim)), bleedBox: union(placements.map(({ bleedBox }) => bleedBox)) })
  })

  test('outer crop marks lie outside the imposed bleed box', () => {
    const imposition = grid({ marks: true })
    const [front] = impositionBoxes(imposition, { bleed: 2 })
    const marks = impositionMarks(imposition, { bleed: 2 })[0]?.marks ?? []
    if (!front) throw new Error('the grid has no front-side boxes')
    const right = front.bleedBox.x + front.bleedBox.width
    const bottom = front.bleedBox.y + front.bleedBox.height
    for (const mark of marks) {
      expect(mark.x2 < front.bleedBox.x || mark.x1 > right || mark.y2 < front.bleedBox.y || mark.y1 > bottom).toBe(true)
    }
  })
})

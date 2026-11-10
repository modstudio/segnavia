import { describe, expect, test } from 'bun:test'
import { Imposition, impositionBoxes, impositionMarks } from './index.ts'

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
    if (!front) throw new Error('the one-sided grid has no boxes')
    expect(front.bleedBox).toEqual(front.trim)
  })

  test.each(['long', 'short'] as const)('mirrors an asymmetric grid onto the back for a %s-edge flip', (flip) => {
    const imposition = grid({ sides: 'two', flip })
    const [front, back] = impositionBoxes(imposition, { bleed: 2 })
    expect(front).toEqual({ side: 'front', trim: { x: 7, y: 9, width: 68, height: 46 }, bleedBox: { x: 5, y: 7, width: 72, height: 50 } })
    expect(back).toEqual(
      flip === 'long'
        ? { side: 'back', trim: { x: 7, y: 25, width: 68, height: 46 }, bleedBox: { x: 5, y: 23, width: 72, height: 50 } }
        : { side: 'back', trim: { x: 25, y: 9, width: 68, height: 46 }, bleedBox: { x: 23, y: 7, width: 72, height: 50 } },
    )
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
    const [front] = impositionBoxes(imposition, { bleed: 2 })
    expect(front).toEqual({ side: 'front', trim: { x: 0, y: 10, width: 300, height: 100 }, bleedBox: { x: 0, y: 8, width: 300, height: 104 } })
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

import { describe, expect, test } from 'bun:test'
import { Imposition, impose, impositionMarks, MARK_THICKNESS_PT, MM_PER_PT } from '@segnavia/format'
import { paperMarkLines, paperOmittedMarks } from './paper-marks.ts'

const grid = (changes: Record<string, unknown> = {}) =>
  Imposition.parse({
    paper: { width: 100, height: 140, unit: 'mm' },
    columns: 2,
    rows: 3,
    cell: { width: 30, height: 30 },
    margin: { top: 10, right: 20, bottom: 30, left: 10 },
    gap: { column: 10, row: 5 },
    marks: true,
    ...changes,
  })

describe('paper mark lines', () => {
  test('uses the PDF segments and shared mark thickness for a 2 by 3 grid', () => {
    const imposition = grid()
    const result = paperMarkLines(imposition, {}, 'front')
    expect(result.lines.map(({ strokeWidth: _, dashArray: __, ...line }) => line)).toEqual(impositionMarks(imposition)[0]?.marks ?? [])
    expect(result.lines.every((line) => line.strokeWidth === MARK_THICKNESS_PT * MM_PER_PT)).toBe(true)
  })

  test('uses millimeter fold dashes', () => {
    const result = paperMarkLines(
      grid({
        fold: 'custom',
        rows: 1,
        panels: [30, 30],
        cell: { height: 30 },
        gap: { column: 0, row: 0 },
        margin: { top: 10, right: 20, bottom: 100, left: 20 },
      }),
      {},
      'front',
    )
    expect(result.lines.filter((line) => line.dashArray).every((line) => line.dashArray?.join(' ') === '2 1')).toBe(true)
    expect(result.lines.some((line) => line.dashArray)).toBe(true)
  })

  test('selects the mirrored back side', () => {
    const imposition = grid({ sides: 'two', flip: 'long' })
    const back = paperMarkLines(imposition, {}, 'back')
    expect(back.lines.map(({ strokeWidth: _, dashArray: __, ...line }) => line)).toEqual(impositionMarks(imposition)[1]?.marks ?? [])
    expect(back.lines).not.toEqual(paperMarkLines(imposition, {}, 'front').lines)
  })

  test('returns no lines when marks are disabled', () => {
    expect(paperMarkLines(grid({ marks: false }), {}, 'front')).toEqual({ lines: [] })
  })

  test('reports the same omitted entries as the PDF geometry', () => {
    const imposition = grid({ margin: { top: 2, right: 20, bottom: 30, left: 10 } })
    expect(paperOmittedMarks(imposition, {})).toEqual(impositionMarks(imposition).flatMap((side) => side.omittedMarks))
  })

  test('uses the shared press bleed in the same geometry as impose', () => {
    const imposition = grid()
    const press = { bleed: 3 }
    const plainLine = paperMarkLines(imposition, {}, 'front').lines[0]
    const bleedLine = paperMarkLines(imposition, press, 'front').lines[0]
    const plainBox = impose(imposition, 6).placements[0]?.bleedBox
    const bleedBox = impose(imposition, 6, press).placements[0]?.bleedBox
    if (!plainLine || !bleedLine || !plainBox || !bleedBox) throw new Error('expected the first crop mark and placement')
    expect(bleedLine.y2 - plainLine.y2).toBe(bleedBox.y - plainBox.y)
  })
})

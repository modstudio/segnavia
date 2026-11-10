import { describe, expect, test } from 'bun:test'
import { applyBoxDecorations, backgroundPaints, decorationEdges, type MeasuredDecorationBox, parseBoxShadows } from './composer-decoration.ts'

const box = (extra: Partial<MeasuredDecorationBox> = {}): MeasuredDecorationBox => ({
  top: 10,
  bottom: 40,
  borderTop: 0,
  borderBottom: 0,
  background: false,
  shadows: [],
  outlineWidth: 0,
  outlineOffset: 0,
  ...extra,
})

describe('decorationEdges', () => {
  test('a box without paint has no decoration edge', () => expect(decorationEdges(box())).toEqual({}))
  test('a border paints only on its measured side', () => expect(decorationEdges(box({ borderTop: 2 }))).toEqual({ top: 10 }))
  test('a background paints to both border-box edges', () => expect(decorationEdges(box({ background: true }))).toEqual({ top: 10, bottom: 40 }))
  test('a shadow extends each edge by its block-axis reach', () =>
    expect(decorationEdges(box({ shadows: [{ offsetBlock: 3, blur: 4, spread: 2 }] }))).toEqual({ top: 7, bottom: 49 }))
  test('an outline extends both edges by its width and offset', () =>
    expect(decorationEdges(box({ outlineWidth: 2, outlineOffset: 3 }))).toEqual({ top: 5, bottom: 45 }))
})

test('the outermost nested opening and closing edges win', () => {
  const lines = [
    { top: 14, bottom: 20 },
    { top: 24, bottom: 30 },
    { top: 34, bottom: 38 },
  ]
  expect(applyBoxDecorations(lines, [box({ background: true }), box({ top: 12, bottom: 32, outlineWidth: 4, outlineOffset: 1 })])).toEqual([
    { top: 14, bottom: 20, decorationTop: 7 },
    { top: 24, bottom: 30, decorationBottom: 37 },
    { top: 34, bottom: 38, decorationBottom: 40 },
  ])
})

test('computed backgrounds distinguish transparent color from painted color or image', () => {
  expect(backgroundPaints('rgba(0, 0, 0, 0)', 'none')).toBe(false)
  expect(backgroundPaints('rgb(0, 0, 0)', 'none')).toBe(true)
  expect(backgroundPaints('rgba(0, 0, 0, 0)', 'linear-gradient(red, blue)')).toBe(true)
})

test('computed shadows parse color and px lengths while ignoring inset paint', () => {
  expect(parseBoxShadows('rgb(0, 0, 0) 2px -3px 4px 5px, rgba(0, 0, 0, 0.2) 0px 1px 2px, inset 0px 0px 3px rgb(0, 0, 0)')).toEqual([
    { offsetBlock: -3, blur: 4, spread: 5 },
    { offsetBlock: 1, blur: 2, spread: 0 },
  ])
})

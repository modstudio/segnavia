import { expect, test } from 'bun:test'
import { PX_PER_MM, pressBoxes } from '@segnavia/format'
import { regularSlideDrawBox } from './deck-paper.ts'

test('a press slide fills its bleed sheet from the sheet origin', () => {
  const size = { width: 400, height: 200 }
  const boxes = pressBoxes({ width: size.width / PX_PER_MM, height: size.height / PX_PER_MM }, { bleed: 3, safe: 0, marks: false })
  const sheet = { width: boxes.bleedBox.width * PX_PER_MM, height: boxes.bleedBox.height * PX_PER_MM }

  const draw = regularSlideDrawBox(size, undefined, sheet)
  expect(draw.x).toBe(0)
  expect(draw.y).toBe(0)
  expect(draw.width).toBeCloseTo(sheet.width * 0.75, 10)
  expect(draw.height).toBeCloseTo(sheet.height * 0.75, 10)
})

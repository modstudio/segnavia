import { expect, test } from 'bun:test'
import { LAYOUT_UNIT_PX, measuredExtentFits } from './paginate-measure.ts'

test('admits one browser layout unit of measured height rounding', () => {
  expect(measuredExtentFits(50 + LAYOUT_UNIT_PX * 0.99, 50)).toBe(true)
  expect(measuredExtentFits(50 + LAYOUT_UNIT_PX * 1.01, 50)).toBe(false)
})

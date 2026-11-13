import { expect, test } from 'bun:test'
import { correctedWindowSpacer, windowContentTop, windowSpacerOffset, windowSpacerProperties } from './composer-window-placement.ts'

test('a window keeps its first block at its galley offset', () => {
  expect(correctedWindowSpacer(24, 30, 30)).toBe(24)
})

test('a window spacer accounts for a collapsed descendant margin', () => {
  expect(correctedWindowSpacer(24, 30, 46)).toBe(8)
  expect(correctedWindowSpacer(16, 16, 32.01)).toBeCloseTo(-0.01)
})

test('a window can pull its first block up to its galley content', () => {
  expect(correctedWindowSpacer(0, 6, 24)).toBe(-18)
})

test('a window spacer carries a signed offset in padding or margin', () => {
  expect(windowSpacerProperties(18)).toEqual({ paddingBlockStart: 18, marginBlockEnd: 0 })
  expect(windowSpacerProperties(0)).toEqual({ paddingBlockStart: 0, marginBlockEnd: 0 })
  expect(windowSpacerProperties(-18)).toEqual({ paddingBlockStart: 0, marginBlockEnd: -18 })
})

test('a window spacer round trips its signed offset', () => {
  for (const offset of [18, 0, -18]) {
    const properties = windowSpacerProperties(offset)
    expect(windowSpacerOffset(properties.paddingBlockStart, properties.marginBlockEnd)).toBe(offset)
  }
})

test('window content top is measured from the flow origin', () => {
  expect(windowContentTop(42, 24)).toBe(18)
})

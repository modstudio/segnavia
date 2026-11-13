import { expect, test } from 'bun:test'
import { correctedWindowSpacer } from './composer-window-placement.ts'

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

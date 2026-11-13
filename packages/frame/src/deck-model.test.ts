import { expect, test } from 'bun:test'
import { formatTime, HEADLESS_ELEMENTS } from './deck-model.ts'

test('the deck model entry loads without DOM globals', () => {
  expect(HEADLESS_ELEMENTS.stage).toBe('segnavia-stage')
  expect(formatTime).toBeFunction()
})

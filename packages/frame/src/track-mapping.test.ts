import { expect, test } from 'bun:test'
import { deckTimeline } from './timeline.ts'
import { trackMsAt } from './track-mapping.ts'

const timeline = deckTimeline({
  slides: [
    { id: 'a', content: { kind: 'html', html: '' }, holdMs: 10_000 },
    { id: 'marker', content: { kind: 'html', html: '' } },
    { id: 'b', content: { kind: 'html', html: '' }, holdMs: 30_000 },
  ],
} as never)

test('continuous track maps proportional time around fixed untimed markers', () => {
  expect(trackMsAt(23.5, 100, timeline, 'ltr')).toBe(10_000)
  expect(trackMsAt(26.5, 100, timeline, 'ltr')).toBe(10_000)
  expect(trackMsAt(57, 100, timeline, 'ltr')).toBeCloseTo(20_000)
})

test('continuous track mirrors position in RTL', () => {
  expect(trackMsAt(43, 100, timeline, 'rtl')).toBeCloseTo(20_000)
  expect(trackMsAt(100, 100, timeline, 'rtl')).toBe(0)
})

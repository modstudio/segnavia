import { expect, test } from 'bun:test'
import { deckTimeline } from './timeline.ts'
import { trackMsAt, trackTargetAt } from './track-mapping.ts'

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

const markerTimeline = deckTimeline({
  slides: [
    { id: 'timed', content: { kind: 'html', html: '' }, holdMs: 1000 },
    { id: 'one', content: { kind: 'html', html: '' } },
    { id: 'two', content: { kind: 'html', html: '' } },
    { id: 'last', content: { kind: 'html', html: '' }, holdMs: 1000 },
  ],
} as never)

test.each([
  ['ltr', 48, 1],
  ['ltr', 58, 2],
  ['rtl', 52, 1],
  ['rtl', 42, 2],
] as const)('continuous track preserves consecutive marker identity in %s', (direction, position, index) => {
  expect(trackTargetAt(position, 100, markerTimeline, direction)).toEqual({ index, localMs: null })
})

const allMarkers = deckTimeline({
  slides: ['one', 'two', 'three'].map((id) => ({ id, content: { kind: 'html', html: '' } })),
} as never)

test.each([
  ['ltr', 3, 0],
  ['ltr', 13, 1],
  ['ltr', 23, 2],
  ['rtl', 27, 0],
  ['rtl', 17, 1],
  ['rtl', 7, 2],
] as const)('an all-untimed track reaches every marker in %s', (direction, position, index) => {
  expect(trackTargetAt(position, 30, allMarkers, direction)).toEqual({ index, localMs: null })
})

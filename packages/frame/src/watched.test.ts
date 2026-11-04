import { describe, expect, test } from 'bun:test'
import { addWatchedSpan, createWatchedModel, limitNavigation, mergeSpans, showWatchedSlide, watchedState } from './watched.ts'

describe('watched spans', () => {
  test('merge overlapping and adjacent spans in position order', () => {
    expect(
      mergeSpans([
        { startMs: 40, endMs: 60 },
        { startMs: 0, endMs: 20 },
        { startMs: 15, endMs: 40 },
        { startMs: 80, endMs: 90 },
      ]),
    ).toEqual([
      { startMs: 0, endMs: 60 },
      { startMs: 80, endMs: 90 },
    ])
  })

  test('replaying a span does not grow the watched union', () => {
    let watched = createWatchedModel([100])
    watched = addWatchedSpan(watched, 0, 10, 70)
    watched = addWatchedSpan(watched, 0, 20, 50)
    expect(watchedState(watched).ms).toBe(60)
    expect(watched.slides[0]?.spans).toEqual([{ startMs: 10, endMs: 70 }])
  })
})

describe('watched state', () => {
  test('reach stops at the continuous watched prefix in a mixed deck', () => {
    let watched = createWatchedModel([100, null, 200])
    watched = addWatchedSpan(watched, 0, 0, 100)
    watched = showWatchedSlide(watched, 1)
    watched = addWatchedSpan(watched, 2, 0, 50)
    watched = addWatchedSpan(watched, 2, 80, 120)
    expect(watchedState(watched).reach).toEqual({ index: 2, ms: 50 })
  })

  test('reach advances by slide through an all-untimed deck', () => {
    let watched = createWatchedModel([null, null, null])
    watched = showWatchedSlide(watched, 0)
    watched = showWatchedSlide(watched, 1)
    expect(watchedState(watched).reach).toEqual({ index: 2, ms: 0 })
    watched = showWatchedSlide(watched, 2)
    expect(watchedState(watched).reach).toEqual({ index: 3, ms: 0 })
  })

  test('share gives every slide equal weight when all are untimed', () => {
    let watched = createWatchedModel([null, null, null])
    watched = showWatchedSlide(watched, 0)
    watched = showWatchedSlide(watched, 2)
    expect(watchedState(watched).share).toBeCloseTo(2 / 3)
    expect(watchedState(watched, 0.5).complete).toBe(true)
  })

  test('zero-duration timed and untimed slides use equal weight', () => {
    let watched = createWatchedModel([0, null])
    expect(watchedState(watched)).toMatchObject({ share: 0.5, complete: false })
    watched = showWatchedSlide(watched, 1)
    expect(watchedState(watched)).toMatchObject({ share: 1, complete: true })
  })

  test('an untimed slide has no weight in a deck with timed duration', () => {
    let watched = createWatchedModel([100, null])
    watched = showWatchedSlide(watched, 1)
    expect(watchedState(watched)).toMatchObject({ share: 0, complete: false })
    watched = addWatchedSpan(watched, 0, 0, 100)
    expect(watchedState(watched)).toMatchObject({ share: 1, complete: true })
  })
})

describe('limitNavigation', () => {
  const reach = { index: 2, ms: 40 }

  test('free navigation passes every request unchanged', () => {
    const to = { index: 8, ms: 90 }
    expect(limitNavigation('free', reach, { kind: 'slide', to })).toBe(to)
  })

  test('furthest navigation orders positions by slide and then milliseconds', () => {
    expect(limitNavigation('furthest', reach, { kind: 'slide', to: { index: 1, ms: 900 } })).toEqual({ index: 1, ms: 900 })
    expect(limitNavigation('furthest', reach, { kind: 'position', to: { index: 2, ms: 40 } })).toEqual(reach)
    expect(limitNavigation('furthest', reach, { kind: 'position', to: { index: 2, ms: 41 } })).toEqual(reach)
  })

  test('a position past reach clamps while a slide request is refused', () => {
    expect(limitNavigation('furthest', reach, { kind: 'position', to: { index: 3, ms: 0 } })).toEqual(reach)
    expect(limitNavigation('furthest', reach, { kind: 'slide', to: { index: 3, ms: 0 } })).toBeNull()
  })

  test('the position after the final slide passes only at complete reach', () => {
    const afterDeck = { index: 3, ms: 0 }
    expect(limitNavigation('furthest', { index: 2, ms: 100 }, { kind: 'slide', to: afterDeck })).toBeNull()
    expect(limitNavigation('furthest', afterDeck, { kind: 'slide', to: afterDeck })).toEqual(afterDeck)
  })
})

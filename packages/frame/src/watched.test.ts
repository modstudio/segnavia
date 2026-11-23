import { describe, expect, test } from 'bun:test'
import { addWatchedSpan, createWatchedModel, mergeSpans, showWatchedSlide, watchedState } from './watched.ts'

const sources = (...durations: Array<number | null>) => durations.map((durationMs, index) => ({ id: String(index), durationMs }))

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
    let watched = createWatchedModel(sources(100))
    watched = addWatchedSpan(watched, 0, 10, 70)
    watched = addWatchedSpan(watched, 0, 20, 50)
    expect(watchedState(watched).ms).toBe(60)
    expect(watched.slides[0]?.spans).toEqual([{ startMs: 10, endMs: 70 }])
  })
})

describe('watched state', () => {
  test('reach stops at the continuous watched prefix in a mixed deck', () => {
    let watched = createWatchedModel(sources(100, null, 200))
    watched = addWatchedSpan(watched, 0, 0, 100)
    watched = showWatchedSlide(watched, 1)
    watched = addWatchedSpan(watched, 2, 0, 50)
    watched = addWatchedSpan(watched, 2, 80, 120)
    expect(watchedState(watched).reach).toEqual({ index: 2, ms: 50 })
  })

  test('reach advances by slide through an all-untimed deck', () => {
    let watched = createWatchedModel(sources(null, null, null))
    watched = showWatchedSlide(watched, 0)
    watched = showWatchedSlide(watched, 1)
    expect(watchedState(watched).reach).toEqual({ index: 2, ms: 0 })
    watched = showWatchedSlide(watched, 2)
    expect(watchedState(watched).reach).toEqual({ index: 3, ms: 0 })
  })

  test('share gives every slide equal weight when all are untimed', () => {
    let watched = createWatchedModel(sources(null, null, null))
    watched = showWatchedSlide(watched, 0)
    watched = showWatchedSlide(watched, 2)
    expect(watchedState(watched).share).toBeCloseTo(2 / 3)
    expect(watchedState(watched, 0.5).complete).toBe(true)
  })

  test('zero-duration timed and untimed slides use equal weight', () => {
    let watched = createWatchedModel(sources(0, null))
    expect(watchedState(watched)).toMatchObject({ share: 0.5, complete: false })
    watched = showWatchedSlide(watched, 1)
    expect(watchedState(watched)).toMatchObject({ share: 1, complete: true })
  })

  test('an untimed slide has no weight in a deck with timed duration', () => {
    let watched = createWatchedModel(sources(100, null))
    watched = showWatchedSlide(watched, 1)
    expect(watchedState(watched)).toMatchObject({ share: 0, complete: false })
    watched = addWatchedSpan(watched, 0, 0, 100)
    expect(watchedState(watched)).toMatchObject({ share: 1, complete: true })
  })
})

describe('watched seed', () => {
  test('maps timed and untimed facts by slide id and drops absent ids', () => {
    const watched = createWatchedModel(
      [
        { id: 'timed', durationMs: 100 },
        { id: 'still', durationMs: null },
      ],
      [
        { slideId: 'missing', reached: true, watchedThrough: true },
        {
          slideId: 'timed',
          reached: true,
          watchedThrough: false,
          spans: [
            { startMs: 80, endMs: 150 },
            { startMs: 0, endMs: 40 },
          ],
        },
        { slideId: 'still', reached: true, watchedThrough: false, spans: [{ startMs: 0, endMs: 10 }] },
      ],
    )
    expect(watched.slides).toEqual([
      {
        durationMs: 100,
        shown: false,
        spans: [
          { startMs: 0, endMs: 40 },
          { startMs: 80, endMs: 100 },
        ],
      },
      { durationMs: null, shown: true, spans: [] },
    ])
  })

  test('watchedThrough wins over spans while reached alone gives a timed slide no coverage', () => {
    const watched = createWatchedModel(sources(100, 100), [
      { slideId: '0', reached: false, watchedThrough: true, spans: [{ startMs: 40, endMs: 60 }] },
      { slideId: '1', reached: true, watchedThrough: false },
    ])
    expect(watched.slides.map((slide) => slide.spans)).toEqual([[{ startMs: 0, endMs: 100 }], []])
  })
})

import { describe, expect, test } from 'bun:test'
import { captionsControlVisible, deckHasNarration, formatTime, stepForwardDisabled, timeValues, trackReach, trackSegmentState } from './control-values.ts'
import { type DeckState, initialDeckState } from './controller-types.ts'

describe('player control values', () => {
  test('formats minutes and hours', () => {
    expect(formatTime(102_999)).toBe('1:42')
    expect(formatTime(3_661_000)).toBe('1:01:01')
  })

  test('narration controls depend on any slide having narration', () => {
    expect(deckHasNarration({ deck: null })).toBe(false)
    expect(deckHasNarration({ deck: { slides: [{ id: 'a', content: { kind: 'html', html: '' } }] } as never })).toBe(false)
    expect(deckHasNarration({ deck: { slides: [{ id: 'a', content: { kind: 'html', html: '' }, narration: {} }] } as never })).toBe(true)
  })

  test('time values are the deck time in either playback mode', () => {
    const slide = { id: 'a', content: { kind: 'html', html: '' }, holdMs: 40_000 } as never
    const state = {
      ...initialDeckState(),
      deck: { slides: [slide] },
      slide,
      slideElapsedMs: 12_000,
      elapsedMs: 22_000,
      totalMs: 60_000,
    } as unknown as DeckState
    expect(timeValues({ ...state, playback: 'segmented' })).toEqual({ elapsedMs: 22_000, totalMs: 60_000 })
    expect(timeValues({ ...state, playback: 'continuous' })).toEqual({ elapsedMs: 22_000, totalMs: 60_000 })
    const untimed = { id: 'b', content: { kind: 'html', html: '' } } as never
    expect(timeValues({ ...state, deck: { slides: [untimed] }, slide: untimed } as unknown as DeckState)).toBeNull()
  })

  test('captions control requires narration and viewer policy', () => {
    const narrated = { deck: { slides: [{ narration: {} }] } } as never
    expect(captionsControlVisible(narrated, 'viewer')).toBe(true)
    expect(captionsControlVisible(narrated, 'on')).toBe(false)
    expect(captionsControlVisible({ deck: { slides: [] } } as never, 'viewer')).toBe(false)
  })

  test('step forward is disabled exactly when the seek policy refuses it', () => {
    const state = navigationState()
    expect(stepForwardDisabled({ ...state, seek: 'furthest', watched: watchedAt(1, 40) })).toBe(true)
    expect(stepForwardDisabled({ ...state, seek: 'free', watched: watchedAt(1, 40) })).toBe(false)
    expect(stepForwardDisabled({ ...state, seek: 'furthest', watched: watchedAt(2, 0) })).toBe(false)
  })

  test('track segments lock only after the furthest reach', () => {
    const state = { ...navigationState(), seek: 'furthest' as const, watched: watchedAt(1, 40) }
    expect([0, 1, 2].map((index) => trackSegmentState(state, index, 1))).toEqual(['done', 'current', 'locked'])
    expect([0, 1, 2].map((index) => trackSegmentState({ ...state, seek: 'free' }, index, 1))).toEqual(['done', 'current', 'upcoming'])
  })

  test('track reach follows continuous and segmented track space', () => {
    const state = { ...navigationState(), seek: 'furthest' as const, watched: watchedAt(1, 50) }
    expect(trackReach({ ...state, playback: 'continuous' })).toBe(0.25)
    expect(trackReach({ ...state, playback: 'segmented' })).toBeCloseTo(5 / 12)
    expect(trackReach({ ...state, seek: 'free', playback: 'continuous' })).toBe(1)
  })

  test('a zero-duration continuous track falls back to slide shares', () => {
    const state = navigationState([untimedSlide('a'), untimedSlide('b'), untimedSlide('c')])
    expect(trackReach({ ...state, seek: 'furthest', playback: 'continuous', totalMs: 0, watched: watchedAt(1, 0) })).toBe(1 / 3)
  })
})

const timedSlide = (id: string, holdMs: number) => ({ id, content: { kind: 'html' as const, html: '' }, holdMs })
const untimedSlide = (id: string) => ({ id, content: { kind: 'html' as const, html: '' } })
const watchedAt = (index: number, ms: number) => ({ ms: 0, share: 0, reach: { index, ms }, complete: false })

function navigationState(slides: NonNullable<DeckState['deck']>['slides'] = [timedSlide('a', 100), timedSlide('b', 200), timedSlide('c', 300)]): DeckState {
  return {
    ...initialDeckState(),
    deck: { slides },
    index: 1,
    slide: slides[1] ?? null,
    totalMs: slides.reduce((total, slide) => total + (slide.holdMs ?? 0), 0),
    watched: watchedAt(1, 50),
  } as DeckState
}

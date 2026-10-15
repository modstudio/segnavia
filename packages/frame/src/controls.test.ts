import { describe, expect, test } from 'bun:test'
import { captionsControlVisible, deckHasNarration, formatTime, timeValues } from './control-values.ts'
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

  test('time values select slide time in step mode and deck time in continuous mode', () => {
    const slide = { id: 'a', content: { kind: 'html', html: '' }, holdMs: 40_000 } as never
    const state = {
      ...initialDeckState(),
      deck: { slides: [slide] },
      slide,
      slideElapsedMs: 12_000,
      elapsedMs: 22_000,
      totalMs: 60_000,
    } as unknown as DeckState
    expect(timeValues(state)).toEqual({ elapsedMs: 12_000, totalMs: 40_000 })
    expect(timeValues({ ...state, playback: 'continuous' })).toEqual({ elapsedMs: 22_000, totalMs: 60_000 })
    expect(timeValues({ ...state, slide: { id: 'b', content: { kind: 'html', html: '' } } })).toBeNull()
  })

  test('captions control requires narration and viewer policy', () => {
    const narrated = { deck: { slides: [{ narration: {} }] } } as never
    expect(captionsControlVisible(narrated, 'viewer')).toBe(true)
    expect(captionsControlVisible(narrated, 'on')).toBe(false)
    expect(captionsControlVisible({ deck: { slides: [] } } as never, 'viewer')).toBe(false)
  })
})

import { describe, expect, test } from 'bun:test'
import { deckHasNarration, formatTime } from './control-values.ts'

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
})

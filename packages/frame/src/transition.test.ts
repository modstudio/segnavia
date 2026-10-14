import { describe, expect, test } from 'bun:test'
import { Deck, type Transition } from '@segnavia/format'
import { transitionFor } from './transition.ts'

const parsed = (transition: Transition = { kind: 'slide', duration: 450 }, dir: 'ltr' | 'rtl' = 'ltr') =>
  Deck.parse({
    title: 'Deck',
    dir,
    transition,
    slides: [
      { id: 'one', content: { kind: 'html', html: 'one' } },
      { id: 'two', content: { kind: 'html', html: 'two' } },
    ],
  })

const choose = (overrides: Partial<Parameters<typeof transitionFor>[0]> = {}) => {
  const deck = overrides.deck ?? parsed()
  const [from, to] = deck.slides
  if (!from || !to) throw new Error('The transition test deck needs two slides.')
  return transitionFor({ deck, from, to, direction: 'forward', hostOverride: undefined, reducedMotion: false, ...overrides })
}

describe('turn transition', () => {
  test('reduced motion forces an instant turn before every other rule', () => {
    expect(choose({ reducedMotion: true, hostOverride: { kind: 'fade', duration: 900 } })).toMatchObject({ kind: 'none', duration: 0 })
  })

  test('a host override wins over the deck and none is instant', () => {
    expect(choose({ hostOverride: { kind: 'fade', duration: 120 } })).toMatchObject({ kind: 'fade', duration: 120 })
    expect(choose({ hostOverride: 'none' })).toMatchObject({ kind: 'none', duration: 0 })
  })

  test('the deck setting applies without an override', () => {
    expect(choose()).toMatchObject({ kind: 'slide', duration: 450 })
  })

  test('forward and back enter from opposite inline sides', () => {
    expect(choose({ direction: 'forward' }).axis).toBe('right')
    expect(choose({ direction: 'back' }).axis).toBe('left')
  })

  test('right-to-left reverses both axes', () => {
    const deck = parsed({ kind: 'slide', duration: 450 }, 'rtl')
    expect(choose({ deck, direction: 'forward' }).axis).toBe('left')
    expect(choose({ deck, direction: 'back' }).axis).toBe('right')
  })
})

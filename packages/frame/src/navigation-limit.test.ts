import { describe, expect, test } from 'bun:test'
import { limitNavigation } from './navigation-limit.ts'

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

import { describe, expect, test } from 'bun:test'
import { parseTransitionProperty, transitionFromAttributes } from './transition-option.ts'

describe('stage transition option', () => {
  test('reads kind and duration attributes independently', () => {
    expect(transitionFromAttributes('fade', null)).toEqual({ kind: 'fade', duration: undefined })
    expect(transitionFromAttributes(null, '800')).toEqual({ kind: undefined, duration: 800 })
    expect(transitionFromAttributes('slide', '0')).toEqual({ kind: 'slide', duration: 0 })
  })

  test('ignores unknown, fractional, and out-of-bounds attribute values', () => {
    expect(transitionFromAttributes('spin', 'fast')).toBeUndefined()
    expect(transitionFromAttributes('fade', '1.5')).toEqual({ kind: 'fade', duration: undefined })
    expect(transitionFromAttributes('fade', '-1')).toEqual({ kind: 'fade', duration: undefined })
    expect(transitionFromAttributes('fade', '2001')).toEqual({ kind: 'fade', duration: undefined })
  })

  test('validates and defaults the object property with the format schema', () => {
    expect(parseTransitionProperty({ kind: 'fade' })).toEqual({ kind: 'fade', duration: 300 })
    expect(parseTransitionProperty('none')).toBe('none')
    expect(() => parseTransitionProperty({ kind: 'spin' } as never)).toThrow("transition.kind must be one of 'none', 'fade', or 'slide'")
    expect(() => parseTransitionProperty({ kind: 'fade', duration: 2001 })).toThrow('transition.duration must be an integer from 0 to 2000 milliseconds')
  })
})

import { describe, expect, test } from 'bun:test'
import { paperViewport, usesPressLayout } from './paper-viewport.ts'
import { Print } from './print.ts'

describe('paperViewport', () => {
  test('returns the CSS-pixel viewport for A4 portrait', () => {
    expect(paperViewport(Print.parse({ paper: 'a4' }))).toEqual({ width: 794, height: 1123 })
  })

  test('applies landscape orientation to A5', () => {
    expect(paperViewport(Print.parse({ paper: 'a5', orientation: 'landscape' }))).toEqual({ width: 794, height: 560 })
  })

  test('returns the CSS-pixel viewport for letter portrait', () => {
    expect(paperViewport(Print.parse({ paper: 'letter' }))).toEqual({ width: 816, height: 1056 })
  })

  test('uses the bleed box for a press-layout viewport', () => {
    expect(paperViewport(Print.parse({ paper: 'a5', orientation: 'landscape', bleed: 3 }))).toEqual({ width: 817, height: 583 })
  })
})

describe('usesPressLayout', () => {
  test.each([
    [{ paper: 'a4' }, false],
    [{ paper: 'a4', bleed: 3 }, true],
    [{ paper: 'a4', marks: true }, true],
    [{ paper: 'a4', bleed: 3, marks: true }, true],
  ] as const)('identifies bleed and marks settings for %j', (input, expected) => {
    expect(usesPressLayout(Print.parse(input))).toBe(expected)
  })
})

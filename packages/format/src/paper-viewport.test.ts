import { describe, expect, test } from 'bun:test'
import { paperViewport } from './paper-viewport.ts'
import { Print } from './print.ts'

describe('paperViewport', () => {
  test('returns the CSS-pixel viewport for A4 portrait', () => {
    expect(paperViewport(Print.parse({ paper: 'a4' }))).toEqual({ width: 794, height: 1123 })
  })

  test('applies landscape orientation to A5', () => {
    expect(paperViewport(Print.parse({ paper: 'a5', orientation: 'landscape' }))).toEqual({ width: 794, height: 560 })
  })

  test('uses the bleed box for a press-layout viewport', () => {
    expect(paperViewport(Print.parse({ paper: 'a5', orientation: 'landscape', bleed: 3 }))).toEqual({ width: 817, height: 583 })
  })
})

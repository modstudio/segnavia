import { expect, test } from 'bun:test'
import { idmlFontStyle } from './fonts.ts'

test('maps IDML font style names case-insensitively while ignoring spaces and hyphens', () => {
  expect(idmlFontStyle('Thin')).toEqual({ weight: 100 })
  expect(idmlFontStyle('Extra-Light')).toEqual({ weight: 200 })
  expect(idmlFontStyle('Semi Bold')).toEqual({ weight: 600 })
  expect(idmlFontStyle('Bold Italic')).toEqual({ weight: 700, style: 'italic' })
  expect(idmlFontStyle('Book Oblique')).toEqual({ weight: 400, style: 'italic' })
  expect(idmlFontStyle('Color')).toEqual({})
})

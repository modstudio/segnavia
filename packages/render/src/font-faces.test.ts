import { expect, test } from 'bun:test'
import { RenderRefusedError } from './errors.ts'
import { fontFaces } from './font-faces.ts'
import type { Font } from './options.ts'

const data = new Uint8Array([0])

function face(overrides: Partial<Font> & Pick<Font, 'family'>): Font {
  return { data, format: 'truetype', ...overrides }
}

test('fontFaces without unicodeRange is the @font-face rule it emits today', () => {
  expect(fontFaces([face({ family: 'Face' })])).toBe(
    '@font-face{font-family:"Face";src:url(data:font/ttf;base64,AA==) format("truetype");font-weight:normal;font-style:normal;font-display:block}',
  )
})

test('fontFaces emits unicode-range after font-style when given', () => {
  const css = fontFaces([
    face({
      family: 'Segnavia Scripts',
      weight: 400,
      style: 'italic',
      unicodeRange: 'u+0590-05ff, u+fb1d-fb4f',
    }),
  ])
  expect(css).toBe(
    '@font-face{font-family:"Segnavia Scripts";src:url(data:font/ttf;base64,AA==) format("truetype");font-weight:400;font-style:italic;unicode-range:U+0590-05FF, U+FB1D-FB4F;font-display:block}',
  )
})

test('fontFaces leaves a sibling without unicodeRange byte-identical and still emits the other face', () => {
  const css = fontFaces([face({ family: 'Segnavia Scripts', unicodeRange: 'U+0000-024F' }), face({ family: 'Segnavia Scripts' })])
  expect(css).toBe(
    '@font-face{font-family:"Segnavia Scripts";src:url(data:font/ttf;base64,AA==) format("truetype");font-weight:normal;font-style:normal;unicode-range:U+0000-024F;font-display:block}@font-face{font-family:"Segnavia Scripts";src:url(data:font/ttf;base64,AA==) format("truetype");font-weight:normal;font-style:normal;font-display:block}',
  )
})

test('fontFaces refuses a malformed unicodeRange naming the face, the range, and what clears it', () => {
  const work = () =>
    fontFaces([
      face({
        family: 'Segnavia Scripts',
        weight: 700,
        style: 'italic',
        unicodeRange: 'U+ZZ',
      }),
    ])
  expect(work).toThrow(RenderRefusedError)
  expect(work).toThrow(
    'The unicode-range "U+ZZ" on face "Segnavia Scripts" (700, italic) is malformed: U+ZZ is not a CSS unicode-range descriptor (U+hex, U+hex-hex, or U+hex with ? wildcards; code points at most 10FFFF). Supply a CSS unicode-range list (U+hex, U+hex-hex, or U+hex with ? wildcards; code points at most 10FFFF) to clear this refusal.',
  )
})

test('fontFaces names omitted weight and style as normal in a unicodeRange refusal', () => {
  expect(() => fontFaces([face({ family: 'Face', unicodeRange: '' })])).toThrow(
    'The unicode-range "" on face "Face" (normal, normal) is malformed: the list is empty. Supply a CSS unicode-range list (U+hex, U+hex-hex, or U+hex with ? wildcards; code points at most 10FFFF) to clear this refusal.',
  )
})

test('fontFaces refuses a null unicodeRange naming the face', () => {
  const work = () =>
    fontFaces([
      face({
        family: 'Segnavia Scripts',
        weight: 700,
        style: 'italic',
        unicodeRange: null as unknown as string,
      }),
    ])
  expect(work).toThrow(RenderRefusedError)
  expect(work).toThrow(
    'The unicode-range null on face "Segnavia Scripts" (700, italic) is malformed: it is not a string (object). Supply a CSS unicode-range list (U+hex, U+hex-hex, or U+hex with ? wildcards; code points at most 10FFFF) to clear this refusal.',
  )
})

test('fontFaces refuses a numeric unicodeRange naming the face', () => {
  const work = () =>
    fontFaces([
      face({
        family: 'Segnavia Scripts',
        weight: 400,
        style: 'italic',
        unicodeRange: 12 as unknown as string,
      }),
    ])
  expect(work).toThrow(RenderRefusedError)
  expect(work).toThrow(
    'The unicode-range 12 on face "Segnavia Scripts" (400, italic) is malformed: it is not a string (number). Supply a CSS unicode-range list (U+hex, U+hex-hex, or U+hex with ? wildcards; code points at most 10FFFF) to clear this refusal.',
  )
})

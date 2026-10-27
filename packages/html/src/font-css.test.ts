import { describe, expect, test } from 'bun:test'
import type { AppFont, FontFace } from '@segnavia/format'
import { bytesToBase64 } from './base64.ts'
import { FontCssRefusedError, fontCss } from './font-css.ts'

const data = new Uint8Array([0])

function face(overrides: Partial<FontFace> & Pick<FontFace, 'family'>): FontFace {
  return { data, format: 'truetype', ...overrides }
}

describe('bytesToBase64', () => {
  test('matches known vectors', () => {
    expect(bytesToBase64(new Uint8Array([0]))).toBe('AA==')
    expect(bytesToBase64(new Uint8Array([0x14, 0xfb, 0x9c, 0x03, 0xd9, 0x7e]))).toBe('FPucA9l+')
    expect(bytesToBase64(new Uint8Array([0x14, 0xfb, 0x9c, 0x03, 0xd9]))).toBe('FPucA9k=')
    expect(bytesToBase64(new Uint8Array([0x14, 0xfb, 0x9c, 0x03]))).toBe('FPucAw==')
    expect(bytesToBase64(new Uint8Array([]))).toBe('')
  })
})

describe('fontCss', () => {
  test('writes the exact @font-face rule and :root property for an app font', () => {
    const app = new Map<string, AppFont>([['serif', { family: 'Body Serif', faces: [face({ family: 'Body Serif' })], generic: 'serif' }]])
    expect(fontCss({ app })).toBe(
      '@font-face{font-family:"Body Serif";src:url(data:font/ttf;base64,AA==) format("truetype");font-weight:normal;font-style:normal;font-display:block}:root{--segnavia-font-serif:"Body Serif",serif}',
    )
  })

  test('omits a generic and quotes family quotes and backslashes', () => {
    const app = new Map<string, AppFont>([['heading', { family: 'Face "X"\\Y', faces: [face({ family: 'Face "X"\\Y' })] }]])
    expect(fontCss({ app })).toBe(
      '@font-face{font-family:"Face \\"X\\"\\\\Y";src:url(data:font/ttf;base64,AA==) format("truetype");font-weight:normal;font-style:normal;font-display:block}:root{--segnavia-font-heading:"Face \\"X\\"\\\\Y"}',
    )
  })

  test('writes local faces after app faces and one :root for every app name', () => {
    const app = new Map<string, AppFont>([
      ['serif', { family: 'Serif', faces: [face({ family: 'Serif' })], generic: 'serif' }],
      ['sans', { family: 'Sans', faces: [face({ family: 'Sans', format: 'woff2' })], generic: 'sans-serif' }],
    ])
    const css = fontCss({ app, local: [face({ family: 'Local Face', weight: 700, style: 'italic' })] })
    expect(css).toBe(
      '@font-face{font-family:"Serif";src:url(data:font/ttf;base64,AA==) format("truetype");font-weight:normal;font-style:normal;font-display:block}@font-face{font-family:"Sans";src:url(data:font/woff2;base64,AA==) format("woff2");font-weight:normal;font-style:normal;font-display:block}@font-face{font-family:"Local Face";src:url(data:font/ttf;base64,AA==) format("truetype");font-weight:700;font-style:italic;font-display:block}:root{--segnavia-font-serif:"Serif",serif;--segnavia-font-sans:"Sans",sans-serif}',
    )
  })

  test('emits unicode-range after font-style when given', () => {
    const css = fontCss({
      app: new Map(),
      local: [
        face({
          family: 'Segnavia Scripts',
          weight: 400,
          style: 'italic',
          unicodeRange: 'u+0590-05ff, u+fb1d-fb4f',
        }),
      ],
    })
    expect(css).toBe(
      '@font-face{font-family:"Segnavia Scripts";src:url(data:font/ttf;base64,AA==) format("truetype");font-weight:400;font-style:italic;unicode-range:U+0590-05FF, U+FB1D-FB4F;font-display:block}',
    )
  })

  test('refuses a malformed unicodeRange naming the face, the range, and what clears it', () => {
    const work = () =>
      fontCss({
        app: new Map(),
        local: [
          face({
            family: 'Segnavia Scripts',
            weight: 700,
            style: 'italic',
            unicodeRange: 'U+ZZ',
          }),
        ],
      })
    expect(work).toThrow(FontCssRefusedError)
    expect(work).toThrow(
      'The unicode-range "U+ZZ" on face "Segnavia Scripts" (700, italic) is malformed: U+ZZ is not a CSS unicode-range descriptor (U+hex, U+hex-hex, or U+hex with ? wildcards). Supply a CSS unicode-range list (U+hex, U+hex-hex, or U+hex with ? wildcards; code points at most 10FFFF) to clear this refusal.',
    )
  })
})

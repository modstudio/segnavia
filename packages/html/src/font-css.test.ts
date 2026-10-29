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

  test('escapes < in face families and custom properties so a style element cannot close', () => {
    const family = 'X</style><script>alert(1)</script>'
    const css = fontCss({
      app: new Map([['serif', { family, faces: [face({ family })], generic: 'serif' }]]),
      local: [face({ family })],
    })
    expect(css.includes('</style>')).toBe(false)
    expect(css).toContain('font-family:"X\\3c /style>\\3c script>alert(1)\\3c /script>"')
    expect(css).toContain('--segnavia-font-serif:"X\\3c /style>\\3c script>alert(1)\\3c /script>",serif')
  })

  test('refuses a family with a control character, naming the family and what clears it', () => {
    const family = 'Face\u0001'
    const work = () => fontCss({ app: new Map(), local: [face({ family })] })
    expect(work).toThrow(FontCssRefusedError)
    expect(work).toThrow(
      `The family ${JSON.stringify(family)} contains a control character; remove control characters from the family name to clear this refusal.`,
    )
  })

  test('refuses a control character in the app-font family used as a custom property', () => {
    const family = 'Body\u007fSerif'
    const work = () => fontCss({ app: new Map([['serif', { family, faces: [face({ family: 'Safe' })] }]]) })
    expect(work).toThrow(FontCssRefusedError)
    expect(work).toThrow(
      `The family ${JSON.stringify(family)} contains a control character; remove control characters from the family name to clear this refusal.`,
    )
  })

  test('refuses an app font name that is not an APP_FONT_NAME', () => {
    const work = () =>
      fontCss({
        app: new Map([['x}body{color:red', { family: 'Body Serif', faces: [face({ family: 'Body Serif' })] }]]),
      })
    expect(work).toThrow(FontCssRefusedError)
    expect(work).toThrow(
      'The app font name "x}body{color:red" could not establish an app font name matching /^[a-z0-9-]+$/; use a lowercase name of letters, digits and hyphens to clear this refusal.',
    )
  })

  test('writes a variable-font weight range of two integers low then high', () => {
    expect(fontCss({ app: new Map(), local: [face({ family: 'Variable Face', weight: '100 900' })] })).toBe(
      '@font-face{font-family:"Variable Face";src:url(data:font/ttf;base64,AA==) format("truetype");font-weight:100 900;font-style:normal;font-display:block}',
    )
    expect(fontCss({ app: new Map(), local: [face({ family: 'Equal Range', weight: '400 400' })] })).toBe(
      '@font-face{font-family:"Equal Range";src:url(data:font/ttf;base64,AA==) format("truetype");font-weight:400 400;font-style:normal;font-display:block}',
    )
    expect(fontCss({ app: new Map(), local: [face({ family: 'Bounds', weight: '1 1000' })] })).toBe(
      '@font-face{font-family:"Bounds";src:url(data:font/ttf;base64,AA==) format("truetype");font-weight:1 1000;font-style:normal;font-display:block}',
    )
  })

  test('refuses a face weight, style or format that is not a CSS descriptor', () => {
    const weightMessage =
      "The face \"Face\" could not establish a CSS font-weight; supply a number 1-1000, two such numbers low then high, or 'normal' or 'bold' to clear this refusal."
    const weight = () => fontCss({ app: new Map(), local: [face({ family: 'Face', weight: '400;}body{' })] })
    expect(weight).toThrow(FontCssRefusedError)
    expect(weight).toThrow(weightMessage)
    for (const invalid of [
      'bolder',
      'lighter',
      '900 100',
      '0 900',
      '100 1001',
      '100  900',
      '100 500 900',
      '100.5 900',
      'normal 900',
      '100\t900',
      ' 100 900',
      '100-900',
    ] as const) {
      const malformed = () => fontCss({ app: new Map(), local: [face({ family: 'Face', weight: invalid })] })
      expect(malformed).toThrow(FontCssRefusedError)
      expect(malformed).toThrow(weightMessage)
    }
    const style = () => fontCss({ app: new Map(), local: [face({ family: 'Face', style: 'italic;}body{' as FontFace['style'] })] })
    expect(style).toThrow(FontCssRefusedError)
    expect(style).toThrow("The face \"Face\" could not establish a font-style of 'normal' or 'italic'; supply 'normal' or 'italic' to clear this refusal.")
    const format = () => fontCss({ app: new Map(), local: [face({ family: 'Face', format: 'woff2;}body{' as FontFace['format'] })] })
    expect(format).toThrow(FontCssRefusedError)
    expect(format).toThrow(
      'The face "Face" could not establish a font format that is one of woff2, woff, truetype, opentype; supply one of woff2, woff, truetype, opentype to clear this refusal.',
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

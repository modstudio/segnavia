import { afterEach, describe, expect, test } from 'bun:test'
import type { AppFont, FontSource } from '@segnavia/format'
import { Page } from '@segnavia/format'
import { packLocalFaces, readLocalFonts } from './local-fonts.ts'
import { FontRefusedError, resolvePageFonts } from './page-fonts.ts'

const signal = new AbortController().signal
const truetype = new Uint8Array([0, 1, 0, 0])
const serif: AppFont = { family: 'Body Serif', faces: [{ family: 'Body Serif', data: new Uint8Array([0]), format: 'truetype' }], generic: 'serif' }
const source: FontSource = { font: async (name) => (name === 'serif' ? serif : undefined) }

interface StubFont {
  family: string
  fullName: string
  postscriptName: string
  style: string
  bytes?: Uint8Array
}

type QueryLocalFonts = () => Promise<
  Array<{
    family: string
    fullName: string
    postscriptName: string
    style: string
    blob(): Promise<Blob>
  }>
>

const host = globalThis as { queryLocalFonts?: QueryLocalFonts }

afterEach(() => {
  delete host.queryLocalFonts
})

function installed(fonts: StubFont[]): QueryLocalFonts {
  return async () =>
    fonts.map((font) => ({
      family: font.family,
      fullName: font.fullName,
      postscriptName: font.postscriptName,
      style: font.style,
      blob: async () => new Blob([Uint8Array.from(font.bytes ?? truetype)]),
    }))
}

describe('readLocalFonts', () => {
  test('reports unsupported with each declared fallback when the API is absent', async () => {
    const result = await readLocalFonts([{ app: 'serif' }, { local: 'Some Local Face', fallback: 'serif' }, { local: 'Other Face', fallback: 'heading' }], {
      signal,
    })
    expect(result.faces).toEqual([])
    expect(result.unavailable).toEqual([
      { family: 'Some Local Face', fallback: 'serif', reason: 'unsupported' },
      { family: 'Other Face', fallback: 'heading', reason: 'unsupported' },
    ])
  })

  test('reports denied with each declared fallback when permission is refused', async () => {
    host.queryLocalFonts = async () => {
      throw new DOMException('Permission denied', 'NotAllowedError')
    }
    const result = await readLocalFonts([{ local: 'Some Local Face', fallback: 'serif' }], { signal })
    expect(result.faces).toEqual([])
    expect(result.unavailable).toEqual([{ family: 'Some Local Face', fallback: 'serif', reason: 'denied' }])
  })

  test('reports not-installed with the declared fallback when the family is missing', async () => {
    host.queryLocalFonts = installed([
      { family: 'Installed Face', fullName: 'Installed Face Regular', postscriptName: 'InstalledFace-Regular', style: 'Regular' },
    ])
    const result = await readLocalFonts([{ local: 'Some Local Face', fallback: 'serif' }], { signal })
    expect(result.faces).toEqual([])
    expect(result.unavailable).toEqual([{ family: 'Some Local Face', fallback: 'serif', reason: 'not-installed' }])
  })

  test('matches an installed family case-insensitively and writes the declared family', async () => {
    host.queryLocalFonts = installed([{ family: 'Alef', fullName: 'Alef Regular', postscriptName: 'Alef-Regular', style: 'Regular' }])
    const result = await readLocalFonts([{ local: 'alef', fallback: 'serif' }], { signal })
    expect(result.unavailable).toEqual([])
    expect(result.faces).toEqual([{ family: 'alef', data: truetype, format: 'truetype', weight: 400, style: 'normal' }])
  })

  test('reports unreadable when a cut cannot be read', async () => {
    host.queryLocalFonts = async () => [
      {
        family: 'Local Face',
        fullName: 'Local Face Regular',
        postscriptName: 'LocalFace-Regular',
        style: 'Regular',
        blob: async () => {
          throw new Error('read failed')
        },
      },
    ]
    const result = await readLocalFonts([{ local: 'Local Face', fallback: 'serif' }], { signal })
    expect(result.faces).toEqual([])
    expect(result.unavailable).toEqual([{ family: 'Local Face', fallback: 'serif', reason: 'unreadable' }])
  })

  test('reports unreadable for a TrueType collection', async () => {
    const ttcf = new Uint8Array([0x74, 0x74, 0x63, 0x66])
    host.queryLocalFonts = installed([
      { family: 'Local Face', fullName: 'Local Face Regular', postscriptName: 'LocalFace-Regular', style: 'Regular', bytes: ttcf },
    ])
    const result = await readLocalFonts([{ local: 'Local Face', fallback: 'serif' }], { signal })
    expect(result.faces).toEqual([])
    expect(result.unavailable).toEqual([{ family: 'Local Face', fallback: 'serif', reason: 'unreadable' }])
  })

  test('groups cuts by postscript name and maps style to weight and italic', async () => {
    host.queryLocalFonts = installed([
      { family: 'Local Face', fullName: 'Local Face Regular', postscriptName: 'LocalFace-Regular', style: 'Regular' },
      { family: 'Local Face', fullName: 'Local Face Regular', postscriptName: 'LocalFace-Regular', style: 'Regular' },
      { family: 'Local Face', fullName: 'Local Face Bold Italic', postscriptName: 'LocalFace-BoldItalic', style: 'Bold Italic' },
    ])
    const result = await readLocalFonts([{ local: 'Local Face', fallback: 'serif' }], { signal })
    expect(result.unavailable).toEqual([])
    expect(result.faces).toEqual([
      { family: 'Local Face', data: truetype, format: 'truetype', weight: 400, style: 'normal' },
      { family: 'Local Face', data: truetype, format: 'truetype', weight: 700, style: 'italic' },
    ])
  })

  test('passing returned faces as fonts.local writes a local @font-face on the page path', async () => {
    host.queryLocalFonts = installed([{ family: 'Local Face', fullName: 'Local Face Regular', postscriptName: 'LocalFace-Regular', style: 'Regular' }])
    const result = await readLocalFonts([{ local: 'Local Face', fallback: 'serif' }], { signal })
    const page = Page.parse({
      html: '<p style="font-family: \'Local Face\', var(--segnavia-font-serif)"></p>',
      fonts: [{ local: 'Local Face', fallback: 'serif' }],
    })
    const css = await resolvePageFonts(page, [], { source, local: result.faces }, signal)
    expect(css).toContain('@font-face{font-family:"Local Face";src:url(data:font/ttf;base64,')
    expect(css).toContain('format("truetype");font-weight:400;font-style:normal;font-display:block}')
    expect(css).toContain('--segnavia-font-serif:"Body Serif",serif')
  })
})

describe('packLocalFaces', () => {
  test('keeps only named local families, using the declared case and round-trippable bytes', async () => {
    const { base64ToBytes } = await import('@segnavia/html')
    const packed = packLocalFaces(
      [
        { family: 'ALEF', data: truetype, format: 'truetype', weight: 400, style: 'normal' },
        { family: 'Other', data: new Uint8Array([1, 2, 3, 4]), format: 'woff' },
      ],
      [{ app: 'heading' }, { local: 'Alef', fallback: 'serif' }],
    )
    expect(packed).toEqual([{ family: 'Alef', data: 'AAEAAA==', format: 'truetype', weight: 400, style: 'normal' }])
    expect(base64ToBytes(packed[0]?.data ?? '')).toEqual(truetype)
  })

  test('packs a complete 18-cut family under the shared defaults', () => {
    const faces = Array.from({ length: 18 }, (_, index) => ({
      family: 'Local Family',
      data: truetype,
      format: 'truetype' as const,
      weight: 100 + index * 50,
    }))
    expect(packLocalFaces(faces, [{ local: 'Local Family', fallback: 'serif' }])).toHaveLength(18)
  })

  test('refuses count and decoded-byte overflow with actionable shared wording', () => {
    const face = { family: 'Local Family', data: truetype, format: 'truetype' as const }
    expect(() =>
      packLocalFaces(
        Array.from({ length: 65 }, () => face),
        [{ local: 'Local Family', fallback: 'serif' }],
      ),
    ).toThrow(FontRefusedError)
    expect(() =>
      packLocalFaces(
        Array.from({ length: 65 }, () => face),
        [{ local: 'Local Family', fallback: 'serif' }],
      ),
    ).toThrow('The local face "Local Family" exceeds the count limit of 64; pass higher limits or declare fewer local font families to clear this refusal.')
    expect(() => packLocalFaces([face], [{ local: 'Local Family', fallback: 'serif' }], { bytes: 3 })).toThrow(
      'The local face "Local Family" exceeds the byte limit of 3; pass higher limits or declare fewer local font families to clear this refusal.',
    )
  })
})

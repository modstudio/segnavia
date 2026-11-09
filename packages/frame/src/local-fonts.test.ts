import { afterEach, describe, expect, test } from 'bun:test'
import { type AppFont, type FontSource, LimitExceededError, Page } from '@segnavia/format'
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

function namedTruetype(name: string): Uint8Array {
  const encoded = Uint8Array.from([...name].flatMap((character) => [0, character.charCodeAt(0)]))
  const bytes = new Uint8Array(46 + encoded.length)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x00010000)
  view.setUint16(4, 1)
  bytes.set(new TextEncoder().encode('name'), 12)
  view.setUint32(20, 28)
  view.setUint32(24, 18 + encoded.length)
  view.setUint16(30, 1)
  view.setUint16(32, 18)
  view.setUint16(34, 3)
  view.setUint16(36, 1)
  view.setUint16(38, 0x409)
  view.setUint16(40, 6)
  view.setUint16(42, encoded.length)
  bytes.set(encoded, 46)
  return bytes
}

function collectedTruetype(name: string, padding = 0): Uint8Array {
  const face = namedTruetype(name)
  const bytes = new Uint8Array(16 + face.length + padding)
  const view = new DataView(bytes.buffer)
  bytes.set(new TextEncoder().encode('ttcf'))
  view.setUint32(4, 0x00010000)
  view.setUint32(8, 1)
  view.setUint32(12, 16)
  bytes.set(face, 16)
  view.setUint32(16 + 20, new DataView(face.buffer).getUint32(20) + 16)
  return bytes
}

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
      blob: async () => new Blob([Uint8Array.from(font.bytes ?? namedTruetype(font.postscriptName))]),
    }))
}

describe('readLocalFonts', () => {
  test('reads a font manifest', async () => {
    const result = await readLocalFonts(
      {
        serif: { faces: [{}] },
        local: { local: 'Some Local Face', fallback: 'serif' },
      },
      { signal },
    )
    expect(result.faces).toEqual([])
    expect(result.unavailable).toEqual([{ family: 'Some Local Face', fallback: 'serif', reason: 'unsupported' }])
  })

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
    expect(result.faces).toEqual([{ family: 'alef', data: namedTruetype('Alef-Regular'), format: 'truetype', weight: 400, style: 'normal' }])
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

  test('refuses a malformed TrueType collection and names its cut', async () => {
    const ttcf = new Uint8Array([0x74, 0x74, 0x63, 0x66])
    host.queryLocalFonts = installed([
      { family: 'Local Face', fullName: 'Local Face Regular', postscriptName: 'LocalFace-Regular', style: 'Regular', bytes: ttcf },
    ])
    const work = readLocalFonts([{ local: 'Local Face', fallback: 'serif' }], { signal })
    await expect(work).rejects.toBeInstanceOf(FontRefusedError)
    await expect(work).rejects.toThrow('LocalFace-Regular: font collection header is malformed')
  })

  test('extracts an installed collection before applying the transport byte limit', async () => {
    const name = 'LocalFace-Regular'
    host.queryLocalFonts = installed([
      { family: 'Local Face', fullName: 'Local Face Regular', postscriptName: name, style: 'Regular', bytes: collectedTruetype(name, 200) },
    ])
    const result = await readLocalFonts([{ local: 'Local Face', fallback: 'serif' }], { signal })
    expect(result.faces[0]?.format).toBe('truetype')
    expect(result.faces[0]?.data.length).toBeLessThan(200)
    expect(packLocalFaces(result.faces, [{ local: 'Local Face', fallback: 'serif' }], { localFonts: { bytes: 200 } })).toHaveLength(1)
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
      { family: 'Local Face', data: namedTruetype('LocalFace-Regular'), format: 'truetype', weight: 400, style: 'normal' },
      { family: 'Local Face', data: namedTruetype('LocalFace-BoldItalic'), format: 'truetype', weight: 700, style: 'italic' },
    ])
  })

  test('refuses and names a mismatched cut even when another family cut resolves', async () => {
    host.queryLocalFonts = installed([
      { family: 'Local Face', fullName: 'Local Face Regular', postscriptName: 'LocalFace-Regular', style: 'Regular' },
      {
        family: 'Local Face',
        fullName: 'Local Face Bold',
        postscriptName: 'LocalFace-Bold',
        style: 'Bold',
        bytes: namedTruetype('Different-Bold'),
      },
    ])
    const work = readLocalFonts([{ local: 'Local Face', fallback: 'serif' }], { signal })
    await expect(work).rejects.toBeInstanceOf(FontRefusedError)
    await expect(work).rejects.toThrow('LocalFace-Bold: font face has PostScript name Different-Bold, not LocalFace-Bold')
  })

  test('passing returned faces as fonts.local writes a local @font-face on the page path', async () => {
    host.queryLocalFonts = installed([{ family: 'Local Face', fullName: 'Local Face Regular', postscriptName: 'LocalFace-Regular', style: 'Regular' }])
    const result = await readLocalFonts([{ local: 'Local Face', fallback: 'serif' }], { signal })
    const page = Page.parse({
      html: '<p style="font-family: \'Local Face\', var(--segnavia-font-serif)"></p>',
      style: { fonts: { local: { local: 'Local Face', fallback: 'serif' } } },
    })
    const { css } = await resolvePageFonts(page, [], { source, local: result.faces }, signal)
    expect(css).toContain('@font-face{font-family:"Local Face";src:url(data:font/ttf;base64,')
    expect(css).toContain('format("truetype");font-weight:400;font-style:normal;font-display:block}')
    expect(css).toContain('--segnavia-font-serif:"Body Serif",serif')
  })
})

describe('packLocalFaces', () => {
  test('packs a font manifest', () => {
    expect(
      packLocalFaces([{ family: 'Alef', data: truetype, format: 'truetype' }], {
        serif: { faces: [{}] },
        local: { local: 'Alef', fallback: 'serif' },
      }),
    ).toEqual([{ family: 'Alef', data: 'AAEAAA==', format: 'truetype' }])
  })

  test.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5])('refuses invalid host limits %p at the packing edge', (bytes) => {
    expect(() => packLocalFaces([], [], { localFonts: { bytes } })).toThrow('limits.localFonts.bytes limit must be a non-negative safe integer')
  })

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
    ).toThrow(LimitExceededError)
    expect(() =>
      packLocalFaces(
        Array.from({ length: 65 }, () => face),
        [{ local: 'Local Family', fallback: 'serif' }],
      ),
    ).toThrow('above the localFonts.count limit of 64')
    expect(() => packLocalFaces([face], [{ local: 'Local Family', fallback: 'serif' }], { localFonts: { bytes: 3 } })).toThrow(
      'above the localFonts.bytes limit of 3',
    )
    try {
      packLocalFaces([face], [{ local: 'Local Family', fallback: 'serif' }], { localFonts: { bytes: 3 } })
    } catch (error) {
      expect((error as LimitExceededError).exceeded).toMatchObject([{ measure: 'localFonts.bytes', limit: 3, actual: 4, where: '"Local Family"' }])
    }
  })
})

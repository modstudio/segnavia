import { afterEach, describe, expect, test } from 'bun:test'
import type { AppFont, FontSource } from '@segnavia/format'
import { Page } from '@segnavia/format'
import { readLocalFonts } from './local-fonts.ts'
import { resolvePageFonts } from './page-fonts.ts'

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

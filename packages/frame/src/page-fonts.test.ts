import { describe, expect, test } from 'bun:test'
import type { AppFont, FontFace, FontSource } from '@segnavia/format'
import { Imposition, Page as PageSchema } from '@segnavia/format'
import { fontCss } from '@segnavia/html'
import { expandFramePage, shownPageDocument } from './motif-expansion.ts'
import { expandedPagesFontCss, FontRefusedError, pageFontCss, resolveFontReferences, resolvePageFonts } from './page-fonts.ts'
import { printablePagesDocument } from './print-document.ts'

const data = new Uint8Array([0])
const serifFace: FontFace = { family: 'Body Serif', data, format: 'truetype' }
const headingFace: FontFace = { family: 'Heading Sans', data, format: 'truetype' }
const serif: AppFont = { family: 'Body Serif', faces: [serifFace], generic: 'serif' }
const heading: AppFont = { family: 'Heading Sans', faces: [headingFace], generic: 'sans-serif' }

function source(fonts: Record<string, AppFont>): FontSource {
  return { font: async (name) => fonts[name] }
}

const signal = new AbortController().signal

const letterhead = {
  key: 'letterhead',
  revision: '1',
  label: 'Letterhead',
  fields: [] as [],
  versions: [{ lang: 'en', html: '<header style="font-family: var(--segnavia-font-heading)">Head</header>' }],
  fonts: [{ app: 'heading' as const }],
}

describe('resolvePageFonts', () => {
  test('asks each app name once and writes faces plus custom properties', async () => {
    const asked: string[] = []
    const fonts: FontSource = {
      font: async (name) => {
        asked.push(name)
        return { serif, heading }[name]
      },
    }
    const page = PageSchema.parse({
      html: '<p style="font-family: var(--segnavia-font-serif)">Body</p>',
      fonts: [{ app: 'serif' }, { app: 'serif' }],
    })
    const css = await resolvePageFonts(page, [{ app: 'heading' }, { app: 'serif' }], { source: fonts }, signal)
    expect(asked).toEqual(['serif', 'heading'])
    expect(css).toBe(
      fontCss({
        app: new Map([
          ['serif', serif],
          ['heading', heading],
        ]),
      }),
    )
    expect(css).toContain('--segnavia-font-serif:"Body Serif",serif')
    expect(css).toContain('--segnavia-font-heading:"Heading Sans",sans-serif')
    expect(css).toContain('data:font/ttf;base64,AA==')
  })

  test('refuses an unknown name naming the font and the page', async () => {
    const page = PageSchema.parse({ id: 'cover', html: '<p></p>', fonts: [{ app: 'missing' }] })
    await expect(resolvePageFonts(page, [], { source: source({ serif }) }, signal)).rejects.toThrow(FontRefusedError)
    await expect(resolvePageFonts(page, [], { source: source({ serif }) }, signal)).rejects.toThrow(
      'page "cover" could not establish app font "missing"; make that font available from the source to clear this refusal.',
    )
  })
})

describe('expandFramePage fonts', () => {
  test('returns the motif font union for the caller to resolve', async () => {
    const page = PageSchema.parse({
      html: '<main data-motif="letterhead">Authored</main>',
      fonts: [{ app: 'serif' }],
      lang: 'en',
    })
    const expanded = await expandFramePage(page, { source: { motif: async () => letterhead } }, signal)
    expect(expanded.fonts).toEqual([{ app: 'heading' }])
    expect(expanded.page.html).toContain('<header style="font-family: var(--segnavia-font-heading)">Head</header>')
  })
})

describe('frame and print documents', () => {
  test('srcdoc and the print document carry the same @font-face bytes and serif property', async () => {
    const page = PageSchema.parse({
      html: '<p style="font-family: var(--segnavia-font-serif)"><span data-motif="letterhead"></span></p>',
      fonts: [{ app: 'serif' }],
      lang: 'en',
    })
    const expanded = await expandFramePage(page, { source: { motif: async () => letterhead } }, signal)
    const css = await resolvePageFonts(expanded.page, expanded.fonts, { source: source({ serif, heading }) }, signal)
    const srcdoc = shownPageDocument(expanded.page, undefined, { nonce: 'testnonce', css })
    const printed = printablePagesDocument(
      [expanded.page],
      Imposition.parse({
        paper: { width: 105, height: 148, unit: 'mm' },
        columns: 1,
        rows: 1,
        cell: { width: 100, height: 140 },
      }),
      { css, nonce: 'testnonce' },
    ).html.replaceAll('&quot;', '"')
    for (const document of [srcdoc, printed]) {
      expect(document).toContain('@font-face{font-family:"Body Serif";src:url(data:font/ttf;base64,AA==) format("truetype")')
      expect(document).toContain('@font-face{font-family:"Heading Sans";src:url(data:font/ttf;base64,AA==) format("truetype")')
      expect(document).toContain('--segnavia-font-serif:"Body Serif",serif')
      expect(document).toContain('--segnavia-font-heading:"Heading Sans",sans-serif')
    }
  })
})

describe('pageFontCss', () => {
  test('refuses named app fonts when no FontSource is supplied', async () => {
    const page = PageSchema.parse({ id: 'cover', html: '<p></p>', fonts: [{ app: 'serif' }] })
    await expect(pageFontCss(page, [], undefined, signal)).rejects.toThrow(FontRefusedError)
    await expect(pageFontCss(page, [], undefined, signal)).rejects.toThrow(
      'page "cover" could not establish app font "serif"; supply a FontSource to clear this refusal.',
    )
  })

  test('refuses motif app fonts when no FontSource is supplied', async () => {
    const page = PageSchema.parse({ html: '<p></p>' })
    await expect(pageFontCss(page, [{ app: 'heading' }], undefined, signal)).rejects.toThrow(
      'page could not establish app font "heading"; supply a FontSource to clear this refusal.',
    )
  })

  test('does not refuse a page that names only local fonts without a source', async () => {
    const page = PageSchema.parse({ html: '<p></p>', fonts: [{ local: 'Some Local Face', fallback: 'serif' }] })
    expect(await pageFontCss(page, [], undefined, signal)).toBe('')
  })
})

describe('expandedPagesFontCss', () => {
  test('unions a page-level font with a motif font from another page', async () => {
    const page = PageSchema.parse({ html: '<p></p>', fonts: [{ app: 'serif' }] })
    const withMotif = await expandFramePage(
      PageSchema.parse({ html: '<main data-motif="letterhead"></main>', lang: 'en' }),
      { source: { motif: async () => letterhead } },
      signal,
    )
    const css = await expandedPagesFontCss([{ page, fonts: [] }, withMotif], { source: source({ serif, heading }) }, signal)
    expect(css).toContain('@font-face{font-family:"Body Serif";src:url(data:font/ttf;base64,AA==) format("truetype")')
    expect(css).toContain('@font-face{font-family:"Heading Sans";src:url(data:font/ttf;base64,AA==) format("truetype")')
    expect(css).toContain('--segnavia-font-serif:"Body Serif",serif')
    expect(css).toContain('--segnavia-font-heading:"Heading Sans",sans-serif')
  })

  test('refuses named app fonts when no FontSource is supplied', async () => {
    const page = PageSchema.parse({ html: '<p></p>', fonts: [{ app: 'serif' }] })
    await expect(expandedPagesFontCss([{ page, fonts: [] }], undefined, signal)).rejects.toThrow(FontRefusedError)
    await expect(expandedPagesFontCss([{ page, fonts: [] }], undefined, signal)).rejects.toThrow(
      'page could not establish app font "serif"; supply a FontSource to clear this refusal.',
    )
  })
})

describe('resolveFontReferences', () => {
  test('refuses an app name that is not an APP_FONT_NAME', async () => {
    await expect(resolveFontReferences([{ app: 'x}body{' }], { source: source({}) }, signal, 'page')).rejects.toThrow(FontRefusedError)
    await expect(resolveFontReferences([{ app: 'x}body{' }], { source: source({}) }, signal, 'page')).rejects.toThrow(
      'page could not establish an app font name matching /^[a-z0-9-]+$/ ("x}body{"); use a lowercase name of letters, digits and hyphens to clear this refusal.',
    )
  })
})

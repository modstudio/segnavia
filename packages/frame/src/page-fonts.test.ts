import { describe, expect, test } from 'bun:test'
import type { AppFont, FontFace, FontSource } from '@segnavia/format'
import { Imposition, Page as PageSchema } from '@segnavia/format'
import { fontCss, resolvePageHtml, resolvePrintedPageHtml } from '@segnavia/html'
import { expandFramePage, expandPrintedFramePage } from './motif-expansion.ts'
import {
  DEFAULT_NOTES_FONT_FAMILY,
  expandedPagesFontCss,
  FontRefusedError,
  notesSheetFontFamily,
  pageFontCss,
  resolveFontReferences,
  resolveNotesFontCss,
  resolvePageFonts,
} from './page-fonts.ts'
import { printablePageValuesDocument } from './print-document.ts'
import { shownPageDocument } from './shown-page-document.ts'

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
      style: { fonts: { serif: { faces: [{}] } } },
    })
    const { css } = await resolvePageFonts(page, [{ app: 'heading' }, { app: 'serif' }], { source: fonts }, signal)
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

  test('reports an unknown name and continues', async () => {
    const page = PageSchema.parse({ id: 'cover', html: '<p></p>', style: { fonts: { missing: { faces: [{}] } } } })
    expect(await resolvePageFonts(page, [], { source: source({ serif }) }, signal)).toEqual({
      css: '',
      failures: [{ font: 'missing', family: 'missing', reason: 'unsupplied' }],
    })
  })

  test('bounds an unsupplied report where it is built', async () => {
    const declarations = Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`font-${index}`, { faces: [{}] }]))
    expect((await resolveFontReferences(declarations, [], { source: source({}) }, signal, 'page')).failures).toHaveLength(64)
  })
})

describe('expandFramePage fonts', () => {
  test('returns the motif font union for the caller to resolve', async () => {
    const page = PageSchema.parse({
      html: '<main data-motif="letterhead">Authored</main>',
      style: { fonts: { serif: { faces: [{}] } } },
      lang: 'en',
    })
    const expanded = await expandFramePage(resolvePageHtml(page), { source: { motif: async () => letterhead } }, signal)
    expect(expanded.fonts).toEqual([{ app: 'heading' }])
    expect(expanded.page.html).toContain('<header style="font-family: var(--segnavia-font-heading)">Head</header>')
  })

  test('reports all section and parent placements once for a printed page', async () => {
    const page = resolvePrintedPageHtml(
      PageSchema.parse({
        print: { paper: 'letter' },
        printedPages: {
          parents: [
            {
              name: 'body',
              margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 },
              foot: '<footer data-motif="foot"></footer>',
            },
          ],
          rules: { every: 'body' },
          sections: [
            { id: 'one', html: '<main data-motif="one"></main>' },
            { id: 'two', html: '<main data-motif="two"></main>' },
          ],
        },
      }),
    )
    const reports: Array<{ placed: Array<{ key: string }> }> = []
    await expandPrintedFramePage(
      page,
      {
        source: {
          motif: async (key) => ({ key, revision: '1', label: key, fields: [], versions: [{ lang: 'en', html: `<b>${key}</b>` }], fonts: [] }),
        },
        placed: (report) => reports.push(report),
      },
      signal,
    )
    expect(reports).toHaveLength(1)
    expect(reports[0]?.placed.map((placement) => placement.key)).toEqual(['one', 'two', 'foot'])
  })
})

describe('frame and print documents', () => {
  test('srcdoc and the print document carry the same @font-face bytes and serif property', async () => {
    const page = PageSchema.parse({
      html: '<p style="font-family: var(--segnavia-font-serif)"><span data-motif="letterhead"></span></p>',
      style: { fonts: { serif: { faces: [{}] } } },
      lang: 'en',
    })
    const expanded = await expandFramePage(resolvePageHtml(page), { source: { motif: async () => letterhead } }, signal)
    const { css } = await resolvePageFonts(expanded.page, expanded.fonts, { source: source({ serif, heading }) }, signal)
    const srcdoc = shownPageDocument(expanded.page, undefined, { nonce: 'testnonce', baseCss: css })
    const printed = printablePageValuesDocument(
      [PageSchema.parse(expanded.page)],
      Imposition.parse({
        paper: { width: 105, height: 148, unit: 'mm' },
        columns: 1,
        rows: 1,
        cell: { width: 100, height: 140 },
      }),
      { baseCss: css, nonce: 'testnonce' },
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
  test('pageFontCss refuses named app fonts when no FontSource is supplied', async () => {
    const page = PageSchema.parse({ id: 'cover', html: '<p></p>', style: { fonts: { serif: { faces: [{}] } } } })
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

  test('refuses a local font fallback when no FontSource is supplied', async () => {
    const page = PageSchema.parse({ html: '<p></p>', style: { fonts: { local: { local: 'Some Local Face', fallback: 'serif' } } } })
    await expect(pageFontCss(page, [], undefined, signal)).rejects.toThrow(
      'page could not establish app font "serif"; supply a FontSource to clear this refusal.',
    )
  })
})

describe('expandedPagesFontCss', () => {
  test('unions a page-level font with a motif font from another page', async () => {
    const page = PageSchema.parse({ html: '<p></p>', style: { fonts: { serif: { faces: [{}] } } } })
    const withMotif = await expandFramePage(
      resolvePageHtml(PageSchema.parse({ html: '<main data-motif="letterhead"></main>', lang: 'en' })),
      { source: { motif: async () => letterhead } },
      signal,
    )
    const { css } = await expandedPagesFontCss([{ page: resolvePageHtml(page), fonts: [] }, withMotif], { source: source({ serif, heading }) }, signal)
    expect(css).toContain('@font-face{font-family:"Body Serif";src:url(data:font/ttf;base64,AA==) format("truetype")')
    expect(css).toContain('@font-face{font-family:"Heading Sans";src:url(data:font/ttf;base64,AA==) format("truetype")')
    expect(css).toContain('--segnavia-font-serif:"Body Serif",serif')
    expect(css).toContain('--segnavia-font-heading:"Heading Sans",sans-serif')
  })

  test('expandedPagesFontCss refuses named app fonts when no FontSource is supplied', async () => {
    const page = PageSchema.parse({ html: '<p></p>', style: { fonts: { serif: { faces: [{}] } } } })
    await expect(expandedPagesFontCss([{ page: resolvePageHtml(page), fonts: [] }], undefined, signal)).rejects.toThrow(FontRefusedError)
    await expect(expandedPagesFontCss([{ page: resolvePageHtml(page), fonts: [] }], undefined, signal)).rejects.toThrow(
      'page could not establish app font "serif"; supply a FontSource to clear this refusal.',
    )
  })
})

describe('resolveFontReferences', () => {
  test('embeds supplied undeclared names and reports only a missing name', async () => {
    expect(await resolveFontReferences({}, ['heading'], { source: source({ heading }) }, signal, 'page')).toEqual({
      css: fontCss({ app: new Map([['heading', heading]]) }),
      failures: [],
    })
    expect((await resolveFontReferences({}, ['missing'], { source: source({}) }, signal, 'page')).failures).toEqual([
      { font: 'missing', family: 'missing', reason: 'unsupplied' },
    ])
  })

  test('refuses an app name that is not an APP_FONT_NAME', async () => {
    await expect(resolveFontReferences({ 'x}body{': { faces: [{}] } }, [], { source: source({}) }, signal, 'page')).rejects.toThrow(FontRefusedError)
    await expect(resolveFontReferences({ 'x}body{': { faces: [{}] } }, [], { source: source({}) }, signal, 'page')).rejects.toThrow(
      'page could not establish an app font name matching /^[a-z0-9-]+$/ ("x}body{"); use a lowercase name of letters, digits and hyphens to clear this refusal.',
    )
  })
})

describe('notes font', () => {
  test('the default notes family is sans-serif and a named font uses its custom property', () => {
    expect(DEFAULT_NOTES_FONT_FAMILY).toBe('sans-serif')
    expect(notesSheetFontFamily(undefined)).toBe('sans-serif')
    expect(notesSheetFontFamily('serif')).toBe('var(--segnavia-font-serif)')
  })

  test('resolveNotesFontCss writes the named face and reports an unknown name', async () => {
    expect(await resolveNotesFontCss(undefined, undefined, signal)).toEqual({ family: DEFAULT_NOTES_FONT_FAMILY, css: '', failures: [] })
    expect(await resolveNotesFontCss('serif', { source: source({ serif }) }, signal)).toEqual({
      family: 'var(--segnavia-font-serif)',
      css: fontCss({
        app: new Map([['serif', serif]]),
      }),
      failures: [],
    })
    expect(await resolveNotesFontCss('missing', { source: source({ serif }) }, signal)).toEqual({
      family: 'var(--segnavia-font-missing)',
      css: '',
      failures: [{ font: 'missing', family: 'missing', reason: 'unsupplied' }],
    })
  })

  test('resolveNotesFontCss refuses a named font with no FontSource', async () => {
    await expect(resolveNotesFontCss('serif', undefined, signal)).rejects.toThrow(FontRefusedError)
    await expect(resolveNotesFontCss('serif', undefined, signal)).rejects.toThrow(
      'notes could not establish app font "serif"; supply a FontSource to clear this refusal.',
    )
  })

  test('resolveNotesFontCss refuses an empty name before asking for a FontSource', async () => {
    await expect(resolveNotesFontCss('', undefined, signal)).rejects.toThrow(FontRefusedError)
    await expect(resolveNotesFontCss('', undefined, signal)).rejects.toThrow(
      'notes could not establish an app font name matching /^[a-z0-9-]+$/ (""); use a lowercase name of letters, digits and hyphens to clear this refusal.',
    )
  })
})

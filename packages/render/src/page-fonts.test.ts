import { describe, expect, test } from 'bun:test'
import type { AppFont, FontFace, FontSource } from '@segnavia/format'
import { Page } from '@segnavia/format'
import { FontRefusedError } from '@segnavia/frame/fonts'
import { expandFramePage } from '@segnavia/frame/motifs'
import { parseBookFixture, resolvePageHtml } from '@segnavia/html'
import { RenderRefusedError } from './errors.ts'
import { prepareRenderedPages, prepareRenderedPageValue, renderOptionsWithBookFonts } from './page-document.ts'

const data = new Uint8Array([0])
const serifFace: FontFace = { family: 'Body Serif', data, format: 'truetype' }
const headingFace: FontFace = { family: 'Heading Sans', data, format: 'truetype' }
const serif: AppFont = { family: 'Body Serif', faces: [serifFace], generic: 'serif' }
const heading: AppFont = { family: 'Heading Sans', faces: [headingFace], generic: 'sans-serif' }
const source: FontSource = {
  font: async (name) => ({ serif, heading })[name],
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
const book = parseBookFixture({
  title: 'Book',
  mode: 'continuous' as const,
  chapters: [{ title: 'Chapter', html: '<p>Text</p>' }],
  style: { fonts: [{ app: 'serif' as const }] },
})

describe('prepareRenderedPageValue', () => {
  test('folds fontSource faces and properties into the render options css', async () => {
    const page = Page.parse({
      html: '<p style="font-family: var(--segnavia-font-serif)"><span data-motif="letterhead"></span></p>',
      style: { fonts: [{ app: 'serif' }] },
      lang: 'en',
    })
    const prepared = await prepareRenderedPageValue(page, { fontSource: source, css: 'p{color:red}' }, { source: { motif: async () => letterhead } }, signal)
    expect(prepared.fontCss).toContain('@font-face{font-family:"Body Serif";src:url(data:font/ttf;base64,AA==) format("truetype")')
    expect(prepared.fontCss).toContain('@font-face{font-family:"Heading Sans";src:url(data:font/ttf;base64,AA==) format("truetype")')
    expect(prepared.fontCss).toContain('--segnavia-font-serif:"Body Serif",serif')
    expect(prepared.fontCss).toContain('--segnavia-font-heading:"Heading Sans",sans-serif')
    expect(prepared.options.css).toBe('p{color:red}')
    expect(prepared.page.html).toContain('<header style="font-family: var(--segnavia-font-heading)">Head</header>')
  })

  test('prepareRenderedPageValue converts a missing FontSource into RenderRefusedError', async () => {
    const page = Page.parse({ html: '<p></p>', style: { fonts: [{ app: 'serif' }] } })
    await expect(prepareRenderedPageValue(page, {}, undefined, signal)).rejects.toThrow(RenderRefusedError)
    await expect(prepareRenderedPageValue(page, {}, undefined, signal)).rejects.toThrow(
      'page could not establish app font "serif"; supply a FontSource to clear this refusal.',
    )
  })

  test('converts FontCssRefusedError from a source face into RenderRefusedError', async () => {
    const family = 'Face\u0001'
    const page = Page.parse({ html: '<p></p>', style: { fonts: [{ app: 'serif' }] } })
    const bad: FontSource = {
      font: async () => ({ family, faces: [{ family, data, format: 'truetype' }] }),
    }
    await expect(prepareRenderedPageValue(page, { fontSource: bad }, undefined, signal)).rejects.toThrow(RenderRefusedError)
    await expect(prepareRenderedPageValue(page, { fontSource: bad }, undefined, signal)).rejects.toThrow(
      `The family ${JSON.stringify(family)} contains a control character; remove control characters from the family name to clear this refusal.`,
    )
  })

  test('converts an unknown name into RenderRefusedError', async () => {
    const page = Page.parse({ html: '<p></p>', style: { fonts: [{ app: 'missing' }] } })
    await expect(prepareRenderedPageValue(page, { fontSource: source }, undefined, signal)).rejects.toThrow(RenderRefusedError)
    await expect(prepareRenderedPageValue(page, { fontSource: source }, undefined, signal)).rejects.toThrow(
      'page could not establish app font "missing"; make that font available from the source to clear this refusal.',
    )
  })

  test('refuses a local font fallback when no FontSource is supplied', async () => {
    const page = Page.parse({ html: '<p></p>', style: { fonts: [{ local: 'Some Local Face', fallback: 'serif' }] } })
    await expect(prepareRenderedPageValue(page, {}, undefined, signal)).rejects.toThrow(
      'page could not establish app font "serif"; supply a FontSource to clear this refusal.',
    )
  })

  test('embeds a transported local face under the CSS family and reports missing faces', async () => {
    const reports: unknown[] = []
    const prepared = await prepareRenderedPageValue(
      Page.parse({
        html: '<p style="font-family: Local Family">Local</p>',
        style: {
          fonts: [
            { local: 'Local Family', fallback: 'serif' },
            { local: 'Missing Family', fallback: 'heading' },
          ],
        },
      }),
      {
        fontSource: source,
        localFonts: { faces: [{ family: 'local family', format: 'truetype', data: 'AAEAAA==' }], report: (report) => reports.push(report) },
      },
      undefined,
      signal,
    )
    expect(prepared.fontCss).toContain('@font-face{font-family:"Local Family"')
    expect(prepared.fontCss).toContain('--segnavia-font-serif:"Body Serif",serif')
    expect(prepared.fontCss).toContain('--segnavia-font-heading:"Heading Sans",sans-serif')
    expect(reports).toEqual([{ fellBack: [{ family: 'Missing Family', fallback: 'heading' }] }])
  })
})

describe('prepareRenderedPages', () => {
  test('embeds and reports local families named only on a later page', async () => {
    const reports: unknown[] = []
    const options = await prepareRenderedPages(
      [
        { page: Page.parse({ html: '<p>First</p>' }), fonts: [] },
        {
          page: Page.parse({
            html: '<p style="font-family:\'Later Local\',var(--segnavia-font-serif)">Later</p>',
            style: {
              fonts: [
                { local: 'Later Local', fallback: 'serif' },
                { local: 'Missing Later', fallback: 'heading' },
              ],
            },
          }),
          fonts: [],
        },
      ],
      {
        fontSource: source,
        localFonts: { faces: [{ family: 'later local', format: 'truetype', data: 'AAEAAA==' }], report: (report) => reports.push(report) },
      },
      signal,
    )
    expect(options.fontCss).toContain('@font-face{font-family:"Later Local"')
    expect(options.fontCss).toContain('--segnavia-font-serif:"Body Serif",serif')
    expect(reports).toEqual([{ fellBack: [{ family: 'Missing Later', fallback: 'heading' }] }])
  })
})

describe('renderOptionsWithBookFonts', () => {
  test('returns book fontSource faces separately from host CSS', async () => {
    const prepared = await renderOptionsWithBookFonts(book, { fontSource: source, css: 'p{color:red}' }, signal)
    expect(prepared.fontCss).toContain('@font-face{font-family:"Body Serif";src:url(data:font/ttf;base64,AA==) format("truetype")')
    expect(prepared.fontCss).toContain('--segnavia-font-serif:"Body Serif",serif')
    expect(prepared.options.css).toBe('p{color:red}')
  })

  test('embeds a font referenced only by an expanded book motif', async () => {
    const prepared = await renderOptionsWithBookFonts({ ...book, style: { ...book.style, fonts: [] } }, { fontSource: source }, signal, [{ app: 'heading' }])
    expect(prepared.fontCss).toContain('@font-face{font-family:"Heading Sans"')
    expect(prepared.fontCss).toContain('--segnavia-font-heading:"Heading Sans",sans-serif')
  })

  test('renderOptionsWithBookFonts converts a missing FontSource into RenderRefusedError', async () => {
    await expect(renderOptionsWithBookFonts(book, {}, signal)).rejects.toThrow(RenderRefusedError)
    await expect(renderOptionsWithBookFonts(book, {}, signal)).rejects.toThrow(
      'book "Book" could not establish app font "serif"; supply a FontSource to clear this refusal.',
    )
  })

  test('embeds a transported book face and reports a missing family', async () => {
    const reports: unknown[] = []
    const prepared = await renderOptionsWithBookFonts(
      {
        ...book,
        style: {
          ...book.style,
          fonts: [
            { local: 'Book Local', fallback: 'serif' },
            { local: 'Missing Book', fallback: 'heading' },
          ],
        },
      },
      {
        fontSource: source,
        localFonts: { faces: [{ family: 'book local', format: 'truetype', data: 'AAEAAA==' }], report: (report) => reports.push(report) },
      },
      signal,
    )
    expect(prepared.fontCss).toContain('@font-face{font-family:"Book Local"')
    expect(prepared.fontCss).toContain('--segnavia-font-serif:"Body Serif",serif')
    expect(reports).toEqual([{ fellBack: [{ family: 'Missing Book', fallback: 'heading' }] }])
  })
})

describe('@segnavia/frame/fonts', () => {
  test('refuses an unknown name at the fonts entry', async () => {
    const { resolvePageFonts } = await import('@segnavia/frame/fonts')
    const page = Page.parse({ html: '<p></p>', style: { fonts: [{ app: 'missing' }] } })
    await expect(resolvePageFonts(page, [], { source }, signal)).rejects.toThrow(FontRefusedError)
    await expect(resolvePageFonts(page, [], { source }, signal)).rejects.toThrow(
      'page could not establish app font "missing"; make that font available from the source to clear this refusal.',
    )
  })
})

describe('expandFramePage', () => {
  test('returns the motif font union for the caller to resolve', async () => {
    const page = Page.parse({
      html: '<p style="font-family: var(--segnavia-font-serif)"><span data-motif="letterhead"></span></p>',
      style: { fonts: [{ app: 'serif' }] },
      lang: 'en',
    })
    const expanded = await expandFramePage(resolvePageHtml(page), { source: { motif: async () => letterhead } }, signal)
    expect(expanded.fonts).toEqual([{ app: 'heading' }])
  })
})

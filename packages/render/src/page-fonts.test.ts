import { describe, expect, test } from 'bun:test'
import type { AppFont, FontFace, FontSource } from '@segnavia/format'
import { Page } from '@segnavia/format'
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
const established = { day: { date: '2026-11-14' as const, zone: 'UTC' as const, kind: 'current' as const }, slots: {} }
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
  style: { fonts: { serif: { faces: [{}] } } },
})

describe('prepareRenderedPageValue', () => {
  test('folds fontSource faces and properties into the render options css', async () => {
    const page = Page.parse({
      html: '<p style="font-family: var(--segnavia-font-serif)"><span data-motif="letterhead"></span></p>',
      style: { fonts: { serif: { faces: [{}] } } },
      lang: 'en',
    })
    const prepared = await prepareRenderedPageValue(
      page,
      { fontSource: source, css: 'p{color:red}' },
      { source: { motif: async () => letterhead } },
      signal,
      established,
    )
    expect(prepared.fontCss).toContain('@font-face{font-family:"Body Serif";src:url(data:font/ttf;base64,AA==) format("truetype")')
    expect(prepared.fontCss).toContain('@font-face{font-family:"Heading Sans";src:url(data:font/ttf;base64,AA==) format("truetype")')
    expect(prepared.fontCss).toContain('--segnavia-font-serif:"Body Serif",serif')
    expect(prepared.fontCss).toContain('--segnavia-font-heading:"Heading Sans",sans-serif')
    expect(prepared.options.css).toBe('p{color:red}')
    expect(prepared.page.html).toContain('<header style="font-family: var(--segnavia-font-heading)">Head</header>')
  })

  test('prepareRenderedPageValue converts a missing FontSource into RenderRefusedError', async () => {
    const page = Page.parse({ html: '<p></p>', style: { fonts: { serif: { faces: [{}] } } } })
    await expect(prepareRenderedPageValue(page, {}, undefined, signal, established)).rejects.toThrow(RenderRefusedError)
    await expect(prepareRenderedPageValue(page, {}, undefined, signal, established)).rejects.toThrow(
      'page could not establish app font "serif"; supply a FontSource to clear this refusal.',
    )
  })

  test('converts FontCssRefusedError from a source face into RenderRefusedError', async () => {
    const family = 'Face\u0001'
    const page = Page.parse({ html: '<p></p>', style: { fonts: { serif: { faces: [{}] } } } })
    const bad: FontSource = {
      font: async () => ({ family, faces: [{ family, data, format: 'truetype' }] }),
    }
    await expect(prepareRenderedPageValue(page, { fontSource: bad }, undefined, signal, established)).rejects.toThrow(RenderRefusedError)
    await expect(prepareRenderedPageValue(page, { fontSource: bad }, undefined, signal, established)).rejects.toThrow(
      `The family ${JSON.stringify(family)} contains a control character; remove control characters from the family name to clear this refusal.`,
    )
  })

  test('reports an unknown name without refusing', async () => {
    const page = Page.parse({ html: '<p></p>', style: { fonts: { missing: { faces: [{}] } } } })
    const prepared = await prepareRenderedPageValue(page, { fontSource: source }, undefined, signal, established)
    expect(prepared.fontFailures).toEqual([{ font: 'missing', family: 'missing', reason: 'unsupplied' }])
  })

  test('keeps an already-present font as a property without embedding it', async () => {
    const page = Page.parse({ html: '<p></p>', style: { fonts: { serif: { faces: [{ weight: [100, 900] }] } } } })
    const prepared = await prepareRenderedPageValue(
      page,
      { fontSource: { font: async () => ({ family: 'Document Serif', faces: [], present: true }) } },
      undefined,
      signal,
      established,
    )
    expect(prepared.fontFailures).toEqual([])
    expect(prepared.fontCss).toBe(':root{--segnavia-font-serif:"Document Serif"}')
    expect(prepared.fontCss).not.toContain('@font-face')
  })

  test('refuses a local font fallback when no FontSource is supplied', async () => {
    const page = Page.parse({ html: '<p></p>', style: { fonts: { local: { local: 'Some Local Face', fallback: 'serif' } } } })
    await expect(prepareRenderedPageValue(page, {}, undefined, signal, established)).rejects.toThrow(
      'page could not establish app font "serif"; supply a FontSource to clear this refusal.',
    )
  })

  test('embeds a transported local face under the CSS family and reports missing faces', async () => {
    const reports: unknown[] = []
    const prepared = await prepareRenderedPageValue(
      Page.parse({
        html: '<p style="font-family: Local Family">Local</p>',
        style: {
          fonts: {
            local: { local: 'Local Family', fallback: 'serif' },
            missing: { local: 'Missing Family', fallback: 'heading' },
          },
        },
      }),
      {
        fontSource: source,
        localFonts: { faces: [{ family: 'local family', format: 'truetype', data: 'AAEAAA==' }], report: (report) => reports.push(report) },
      },
      undefined,
      signal,
      established,
    )
    expect(prepared.fontCss).toContain('@font-face{font-family:"Local Family"')
    expect(prepared.fontCss).toContain('--segnavia-font-serif:"Body Serif",serif')
    expect(prepared.fontCss).toContain('--segnavia-font-heading:"Heading Sans",sans-serif')
    expect(reports).toEqual([{ fellBack: [{ family: 'Missing Family', fallback: 'heading' }] }])
  })
})

describe('prepareRenderedPages', () => {
  test('retains distinct motif locals and a page declaration colliding with a motif app reference', async () => {
    const prepared = await prepareRenderedPages(
      [
        {
          page: Page.parse({ html: '', style: { fonts: { heading: { faces: [{ weight: 700 }], generic: 'serif' } } } }),
          fonts: [{ app: 'heading' }, { local: 'First Local', fallback: 'heading' }],
        },
        { page: Page.parse({ html: '' }), fonts: [{ local: 'Second Local', fallback: 'heading' }] },
      ],
      {
        fontSource: source,
        localFonts: {
          faces: [
            { family: 'First Local', format: 'truetype', data: 'AAEAAA==' },
            { family: 'Second Local', format: 'truetype', data: 'AAEAAA==' },
          ],
        },
      },
      signal,
    )
    expect(prepared.fontCss).toContain('@font-face{font-family:"First Local"')
    expect(prepared.fontCss).toContain('@font-face{font-family:"Second Local"')
    expect(prepared.fontCss).toContain('--segnavia-font-heading:"Heading Sans",serif')
  })

  test('embeds and reports local families named only on a later page', async () => {
    const reports: unknown[] = []
    const options = await prepareRenderedPages(
      [
        { page: Page.parse({ html: '<p>First</p>' }), fonts: [] },
        {
          page: Page.parse({
            html: '<p style="font-family:\'Later Local\',var(--segnavia-font-serif)">Later</p>',
            style: {
              fonts: {
                local: { local: 'Later Local', fallback: 'serif' },
                missing: { local: 'Missing Later', fallback: 'heading' },
              },
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
    const prepared = await renderOptionsWithBookFonts({ ...book, style: { ...book.style, fonts: {} } }, { fontSource: source }, signal, [{ app: 'heading' }])
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
          fonts: {
            local: { local: 'Book Local', fallback: 'serif' },
            missing: { local: 'Missing Book', fallback: 'heading' },
          },
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
  test('reports an unknown name at the fonts entry', async () => {
    const { resolvePageFonts } = await import('@segnavia/frame/fonts')
    const page = Page.parse({ html: '<p></p>', style: { fonts: { missing: { faces: [{}] } } } })
    expect(await resolvePageFonts(page, [], { source }, signal)).toEqual({
      css: '',
      failures: [{ font: 'missing', family: 'missing', reason: 'unsupplied' }],
    })
  })
})

describe('expandFramePage', () => {
  test('returns the motif font union for the caller to resolve', async () => {
    const page = Page.parse({
      html: '<p style="font-family: var(--segnavia-font-serif)"><span data-motif="letterhead"></span></p>',
      style: { fonts: { serif: { faces: [{}] } } },
      lang: 'en',
    })
    const expanded = await expandFramePage(resolvePageHtml(page), { source: { motif: async () => letterhead } }, signal)
    expect(expanded.fonts).toEqual([{ app: 'heading' }])
  })
})

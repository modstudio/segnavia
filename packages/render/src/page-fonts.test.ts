import { describe, expect, test } from 'bun:test'
import type { AppFont, FontFace, FontSource } from '@segnavia/format'
import { Page } from '@segnavia/format'
import { FontRefusedError } from '@segnavia/frame/fonts'
import { expandFramePage } from '@segnavia/frame/motifs'
import { RenderRefusedError } from './errors.ts'
import { prepareRenderedPage, prepareRenderedPages, renderOptionsWithBookFonts } from './page-document.ts'

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
const book = {
  title: 'Book',
  mode: 'continuous' as const,
  chapters: [{ title: 'Chapter', html: '<p>Text</p>' }],
  fonts: [{ app: 'serif' as const }],
}

describe('prepareRenderedPage', () => {
  test('folds fontSource faces and properties into the render options css', async () => {
    const page = Page.parse({
      html: '<p style="font-family: var(--segnavia-font-serif)"><span data-motif="letterhead"></span></p>',
      fonts: [{ app: 'serif' }],
      lang: 'en',
    })
    const prepared = await prepareRenderedPage(page, { fontSource: source, css: 'p{color:red}' }, { source: { motif: async () => letterhead } }, signal)
    expect(prepared.options.css).toContain('@font-face{font-family:"Body Serif";src:url(data:font/ttf;base64,AA==) format("truetype")')
    expect(prepared.options.css).toContain('@font-face{font-family:"Heading Sans";src:url(data:font/ttf;base64,AA==) format("truetype")')
    expect(prepared.options.css).toContain('--segnavia-font-serif:"Body Serif",serif')
    expect(prepared.options.css).toContain('--segnavia-font-heading:"Heading Sans",sans-serif')
    expect(prepared.options.css).toContain('p{color:red}')
    expect(prepared.page.html).toContain('<header style="font-family: var(--segnavia-font-heading)">Head</header>')
  })

  test('prepareRenderedPage converts a missing FontSource into RenderRefusedError', async () => {
    const page = Page.parse({ html: '<p></p>', fonts: [{ app: 'serif' }] })
    await expect(prepareRenderedPage(page, {}, undefined, signal)).rejects.toThrow(RenderRefusedError)
    await expect(prepareRenderedPage(page, {}, undefined, signal)).rejects.toThrow(
      'page could not establish app font "serif"; supply a FontSource to clear this refusal.',
    )
  })

  test('converts FontCssRefusedError from a source face into RenderRefusedError', async () => {
    const family = 'Face\u0001'
    const page = Page.parse({ html: '<p></p>', fonts: [{ app: 'serif' }] })
    const bad: FontSource = {
      font: async () => ({ family, faces: [{ family, data, format: 'truetype' }] }),
    }
    await expect(prepareRenderedPage(page, { fontSource: bad }, undefined, signal)).rejects.toThrow(RenderRefusedError)
    await expect(prepareRenderedPage(page, { fontSource: bad }, undefined, signal)).rejects.toThrow(
      `The family ${JSON.stringify(family)} contains a control character; remove control characters from the family name to clear this refusal.`,
    )
  })

  test('converts an unknown name into RenderRefusedError', async () => {
    const page = Page.parse({ html: '<p></p>', fonts: [{ app: 'missing' }] })
    await expect(prepareRenderedPage(page, { fontSource: source }, undefined, signal)).rejects.toThrow(RenderRefusedError)
    await expect(prepareRenderedPage(page, { fontSource: source }, undefined, signal)).rejects.toThrow(
      'page could not establish app font "missing"; make that font available from the source to clear this refusal.',
    )
  })

  test('refuses a local font fallback when no FontSource is supplied', async () => {
    const page = Page.parse({ html: '<p></p>', fonts: [{ local: 'Some Local Face', fallback: 'serif' }] })
    await expect(prepareRenderedPage(page, {}, undefined, signal)).rejects.toThrow(
      'page could not establish app font "serif"; supply a FontSource to clear this refusal.',
    )
  })

  test('embeds a transported local face under the CSS family and reports missing faces', async () => {
    const reports: unknown[] = []
    const prepared = await prepareRenderedPage(
      {
        html: '<p style="font-family: Local Family">Local</p>',
        fonts: [
          { local: 'Local Family', fallback: 'serif' },
          { local: 'Missing Family', fallback: 'heading' },
        ],
      },
      {
        fontSource: source,
        localFonts: { faces: [{ family: 'local family', format: 'truetype', data: 'AAEAAA==' }], report: (report) => reports.push(report) },
      },
      undefined,
      signal,
    )
    expect(prepared.options.css).toContain('@font-face{font-family:"Local Family"')
    expect(prepared.options.css).toContain('--segnavia-font-serif:"Body Serif",serif')
    expect(prepared.options.css).toContain('--segnavia-font-heading:"Heading Sans",sans-serif')
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
            fonts: [
              { local: 'Later Local', fallback: 'serif' },
              { local: 'Missing Later', fallback: 'heading' },
            ],
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
    expect(options.css).toContain('@font-face{font-family:"Later Local"')
    expect(options.css).toContain('--segnavia-font-serif:"Body Serif",serif')
    expect(reports).toEqual([{ fellBack: [{ family: 'Missing Later', fallback: 'heading' }] }])
  })
})

describe('renderOptionsWithBookFonts', () => {
  test('folds book fontSource faces into options.css', async () => {
    const options = await renderOptionsWithBookFonts(book, { fontSource: source, css: 'p{color:red}' }, signal)
    expect(options.css).toContain('@font-face{font-family:"Body Serif";src:url(data:font/ttf;base64,AA==) format("truetype")')
    expect(options.css).toContain('--segnavia-font-serif:"Body Serif",serif')
    expect(options.css).toContain('p{color:red}')
  })

  test('renderOptionsWithBookFonts converts a missing FontSource into RenderRefusedError', async () => {
    await expect(renderOptionsWithBookFonts(book, {}, signal)).rejects.toThrow(RenderRefusedError)
    await expect(renderOptionsWithBookFonts(book, {}, signal)).rejects.toThrow(
      'book "Book" could not establish app font "serif"; supply a FontSource to clear this refusal.',
    )
  })

  test('embeds a transported book face and reports a missing family', async () => {
    const reports: unknown[] = []
    const options = await renderOptionsWithBookFonts(
      {
        ...book,
        fonts: [
          { local: 'Book Local', fallback: 'serif' },
          { local: 'Missing Book', fallback: 'heading' },
        ],
      },
      {
        fontSource: source,
        localFonts: { faces: [{ family: 'book local', format: 'truetype', data: 'AAEAAA==' }], report: (report) => reports.push(report) },
      },
      signal,
    )
    expect(options.css).toContain('@font-face{font-family:"Book Local"')
    expect(options.css).toContain('--segnavia-font-serif:"Body Serif",serif')
    expect(reports).toEqual([{ fellBack: [{ family: 'Missing Book', fallback: 'heading' }] }])
  })
})

describe('@segnavia/frame/fonts', () => {
  test('refuses an unknown name at the fonts entry', async () => {
    const { resolvePageFonts } = await import('@segnavia/frame/fonts')
    const page = Page.parse({ html: '<p></p>', fonts: [{ app: 'missing' }] })
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
      fonts: [{ app: 'serif' }],
      lang: 'en',
    })
    const expanded = await expandFramePage(page, { source: { motif: async () => letterhead } }, signal)
    expect(expanded.fonts).toEqual([{ app: 'heading' }])
  })
})

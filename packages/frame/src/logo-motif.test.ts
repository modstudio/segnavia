import { describe, expect, test } from 'bun:test'
import { BookView, Deck, Page } from '@segnavia/format'
import { MotifRefusedError, parseBookFixture, resolvePageHtml } from '@segnavia/html'
import { prepareBookView, prepareBookViewWithoutSources } from './book-motifs.ts'
import { expandFrameBookValue, expandFramePage } from './motif-expansion.ts'
import { htmlSlideDocument } from './slide-print-document.ts'

const logo = { src: 'data:image/svg+xml,%3Csvg/%3E', alt: 'House' }
const signal = new AbortController().signal

describe('logo motif surfaces', () => {
  test('expands in a page without a host motif source', async () => {
    const page = resolvePageHtml(Page.parse({ brand: { logo }, html: '<main data-motif="segnavia:logo"></main>' }))
    expect((await expandFramePage(page, undefined, signal)).page.html).toContain(
      '<main data-motif="segnavia:logo"><img src="data:image/svg+xml,%3Csvg/%3E" alt="House" dir="ltr"></main>',
    )
  })

  test('expands in running furniture', async () => {
    const page = resolvePageHtml(
      Page.parse({
        brand: { logo },
        html: '<p>Body</p>',
        print: { paper: 'a4' },
        printedPages: {
          parents: [{ name: 'body', regions: { head: { edge: 'blockStart', html: '<header data-motif="segnavia:logo"></header>' } } }],
          parentRules: [{ parent: 'body' }],
        },
      }),
    )
    const expanded = await expandFramePage(page, undefined, signal)
    expect(expanded.page.printedPages?.parents[0]?.regions.head?.html).toContain('<img src="data:image/svg+xml,%3Csvg/%3E" alt="House" dir="ltr">')
  })

  test('expands in a slide frame', () => {
    const deck = Deck.parse({ title: 'Deck', brand: { logo }, slides: [{ id: 'one', content: { kind: 'html', html: '' } }] })
    expect(htmlSlideDocument(deck, '<div data-motif="segnavia:logo"></div>', { nonce: 'known' })).toContain(
      '<div data-motif="segnavia:logo"><img src="data:image/svg+xml,%3Csvg/%3E" alt="House" dir="ltr"></div>',
    )
  })

  test('the slide print path delivers a logo refusal through its refusal error', () => {
    const deck = Deck.parse({
      title: 'Deck',
      brandName: 'house',
      slides: [{ id: 'one', content: { kind: 'html', html: '' } }],
    })
    expect(() => htmlSlideDocument(deck, '<div data-motif="segnavia:logo"></div>', { nonce: 'known' })).toThrow(MotifRefusedError)
    expect(() => htmlSlideDocument(deck, '<div data-motif="segnavia:logo"></div>', { nonce: 'known' })).toThrow(/brand "house"/)
  })

  test('expands a brand logo in a book value', async () => {
    const book = parseBookFixture({
      title: 'Book',
      mode: 'continuous',
      brand: { logo },
      chapters: [{ title: 'One', html: '<header data-motif="segnavia:logo"></header>' }],
    })
    const expanded = await expandFrameBookValue(book, undefined, signal)
    expect(expanded.book.body[0]).toMatchObject({ html: expect.stringContaining('<img src="data:image/svg+xml,%3Csvg/%3E" alt="House" dir="ltr">') })
  })

  test('prepares logos in every book-view field without sources and with fonts only', async () => {
    const view = BookView.parse({
      brand: { logo },
      html: '<main data-motif="segnavia:logo"></main>',
      flow: '<article data-motif="segnavia:logo"></article>',
      pagination: {
        paper: { width: 100, height: 200 },
        margin: { blockStart: 1, blockEnd: 1, inlineStart: 1, inlineEnd: 1 },
        columnGap: 1,
        geometries: [],
        direction: 'ltr',
        numbering: { frontMatter: 'roman-lower', body: 'arabic', printed: { frontMatter: true, body: true } },
        rectoOpenings: false,
        orphans: 2,
        widows: 2,
        parents: [
          {
            name: 'body',
            margin: { blockStart: 1, blockEnd: 1, inlineStart: 1, inlineEnd: 1 },
            regions: { head: { edge: 'blockStart', html: '<header data-motif="segnavia:logo"></header>' } },
          },
        ],
        endnotePlacement: 'book',
        contents: { pageNumbers: true, depth: 2 },
      },
    })
    const withoutSources = prepareBookViewWithoutSources(view).view
    expect(withoutSources.html).toContain('<img')
    expect(withoutSources.flow).toContain('<img')
    expect(withoutSources.pagination?.parents[0]?.regions.head?.html).toContain('<img')

    const fontsOnly = await prepareBookView(view, undefined, { source: { font: async () => undefined } }, signal)
    expect(fontsOnly.view.html).toContain('<img')
    expect(fontsOnly.view.flow).toContain('<img')
    expect(fontsOnly.view.pagination?.parents[0]?.regions.head?.html).toContain('<img')
  })

  test('book views without motif sources refuse a missing logo', async () => {
    const view = BookView.parse({ brandName: 'house', html: '<main data-motif="segnavia:logo"></main>' })
    expect(() => prepareBookViewWithoutSources(view)).toThrow(/logo of brand "house"/)
    await expect(prepareBookView(view, undefined, { source: { font: async () => undefined } }, signal)).rejects.toThrow(/logo of brand "house"/)
  })
})

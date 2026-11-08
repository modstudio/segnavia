import { expect, test } from 'bun:test'
import { BookView, isChapter, PAGE_WIDTHS, Page, paperPixels, sheetMm } from '@segnavia/format'
import { bookDocument, parseBookFixture, resolvePageHtml } from '@segnavia/html'
import { expandFrameBookValue as expandFrameBook, expandFrameBookView, expandFramePage } from './motif-expansion.ts'

const signal = new AbortController().signal
const src = 'data:image/png;base64,AA=='
const placements = {
  resolve: async () => ({ kind: 'media' as const, media: { format: 'png' as const, size: { width: 20, height: 10 } }, src }),
}

test('frame page preparation resolves placed media into the document HTML', async () => {
  const page = Page.parse({ html: '<img data-segnavia-media="cover">', size: { width: 320, height: 200 } })
  expect((await expandFramePage(resolvePageHtml(page), undefined, signal, placements)).page.html).toContain(`src="${src}"`)
})

test('frame book preparation resolves placed media into the document HTML', async () => {
  const view = BookView.parse({ html: '<main><img data-segnavia-media="cover"></main>' })
  expect((await expandFrameBookView(view, undefined, signal, placements)).book.html).toContain(`src="${src}"`)
})

test('Book preparation resolves placed media through the book PDF field path', async () => {
  const book = parseBookFixture({
    title: 'Placed',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } },
    chapters: [{ title: 'One', html: '<img data-segnavia-media="cover">' }],
  })
  const expanded = await expandFrameBook(book, undefined, signal, placements)
  expect(bookDocument(expanded.book).html).toContain(`src="${src}"`)
})

test('placed page entries become designed sections before the book is built', async () => {
  const book = parseBookFixture({
    title: 'Placed',
    mode: 'continuous',
    chapters: [
      {
        kind: 'placed',
        title: 'Placed page',
        contentsLabel: 'Short label',
        contents: false,
        opens: 'recto',
        placement: { kind: 'page', address: 'page/one' },
      },
    ],
  })
  const expanded = await expandFrameBook(book, undefined, signal, {
    resolve: async () => ({
      kind: 'page',
      page: {
        type: 'document',
        kind: 'page',
        size: { width: 320, height: 200 },
        children: [{ type: 'page', body: { html: '<p>Resolved page</p>' } }],
      },
    }),
  })
  expect(bookDocument(expanded.book).html).toMatch(/<p data-segnavia-id="[^"]+">Resolved page<\/p>/)
  expect(expanded.book.body[0]).toMatchObject({
    kind: 'designed',
    title: 'Placed page',
    contentsLabel: 'Short label',
    contents: false,
    opens: 'recto',
    pages: [{ html: expect.stringMatching(/<p data-segnavia-id="[^"]+">Resolved page<\/p>/) }],
  })
})

test('a live placed entry without placements holds its page with a placeholder', async () => {
  const book = parseBookFixture({ title: 'Placed', mode: 'continuous', chapters: [{ kind: 'placed', placement: { kind: 'media', address: 'media/missing' } }] })
  const expanded = await expandFrameBook(book, undefined, signal)
  expect(bookDocument(expanded.book).html).toContain('data-segnavia-placement="missing"')
})

test('print refuses the first placed entry when placements are absent', async () => {
  const book = parseBookFixture({ title: 'Placed', mode: 'continuous', chapters: [{ kind: 'placed', placement: { kind: 'media', address: 'media/missing' } }] })
  await expect(expandFrameBook(book, undefined, signal, undefined, 'print')).rejects.toThrow(
    'body.0 is a placed entry; pass placements to resolve placed entries',
  )
})

test('a placed section is not a chapter', () => {
  const book = parseBookFixture({ title: 'Placed', mode: 'continuous', chapters: [{ kind: 'placed', placement: { kind: 'media', address: 'media/missing' } }] })
  expect(isChapter(book.body[0] as never)).toBe(false)
})

test('placed media entries use image resolution and missing reporting', async () => {
  const book = parseBookFixture({ title: 'Placed', mode: 'continuous', chapters: [{ kind: 'placed', placement: { kind: 'media', address: 'media/missing' } }] })
  const reports: unknown[] = []
  const expanded = await expandFrameBook(book, undefined, signal, { resolve: async () => undefined, report: (entry) => reports.push(entry) })
  expect(bookDocument(expanded.book).html).toContain('data-segnavia-placement="missing"')
  expect(reports).toEqual([{ address: 'media/missing', page: undefined, reason: 'missing' }])
})

test('chooses placement widths from print, flowing, fixed, and paginated book viewports', async () => {
  const widths: number[] = []
  const capture = {
    resolve: async (_placement: unknown, context: { width?: number }) => {
      if (context.width !== undefined) widths.push(context.width)
      return { kind: 'media' as const, media: { format: 'png' as const, size: { width: 20, height: 10 } }, src }
    },
  }
  const image = '<img data-segnavia-media="cover">'
  const printed = Page.parse({ html: image, print: { paper: 'a4' } })
  await expandFramePage(resolvePageHtml(printed), undefined, signal, capture)
  await expandFramePage(resolvePageHtml(Page.parse({ html: image })), undefined, signal, capture)
  await expandFramePage(resolvePageHtml(Page.parse({ html: image, size: { width: 'standard', height: 'auto' } })), undefined, signal, capture, 'screen', {
    standard: 900,
  })
  await expandFramePage(resolvePageHtml(Page.parse({ html: image, size: { width: 'wide', height: 'auto' } })), undefined, signal, capture)
  await expandFramePage(resolvePageHtml(Page.parse({ html: image, size: { width: 600, height: 'auto' } })), undefined, signal, capture)
  await expandFramePage(resolvePageHtml(Page.parse({ html: image, size: { width: 420, height: 240 } })), undefined, signal, capture)
  const book = parseBookFixture({
    title: 'Widths',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } },
    chapters: [{ title: 'One', html: image }],
  })
  await expandFrameBook(book, undefined, signal, capture)
  if (!book.page) throw new Error('Expected the parsed paginated book to carry its page.')
  expect(widths).toEqual([
    paperPixels(sheetMm(printed.print as NonNullable<typeof printed.print>).width),
    PAGE_WIDTHS.standard,
    900,
    PAGE_WIDTHS.wide,
    600,
    420,
    paperPixels(sheetMm(book.page).width),
  ])
})

test('placements introduced by motif expansion resolve afterward', async () => {
  const page = Page.parse({ html: '<div data-motif="hero"></div>', size: { width: 320, height: 200 } })
  const motifs = {
    source: {
      motif: async () => ({
        key: 'hero',
        label: 'Hero',
        revision: '1',
        fields: [],
        fonts: [],
        versions: [{ lang: 'en', html: '<img data-segnavia-media="cover">' }],
      }),
    },
  }
  expect((await expandFramePage(resolvePageHtml(page), motifs, signal, placements)).page.html).toContain(`src="${src}"`)
})

test('page parent furniture resolves placed media before document building', async () => {
  const page = Page.parse({ html: '<main>Body</main>', size: { width: 320, height: 200 } })
  const withParent = {
    ...page,
    printedPages: { parents: [{ name: 'body', head: '<img data-segnavia-media="cover">' }] },
  } as unknown as Page
  const resolved = await expandFramePage(resolvePageHtml(withParent), undefined, signal, placements)
  expect(resolved.page.printedPages?.parents[0]?.head).toContain(`src="${src}"`)
})

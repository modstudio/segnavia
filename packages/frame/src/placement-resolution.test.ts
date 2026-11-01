import { expect, test } from 'bun:test'
import { Book, BookView, FLUID_WIDTH, Page, paperPixels, sheetMm } from '@segnavia/format'
import { bookDocument } from '@segnavia/html'
import { expandFrameBook, expandFrameBookView, expandFramePage } from './motif-expansion.ts'

const signal = new AbortController().signal
const src = 'data:image/png;base64,AA=='
const placements = {
  resolve: async () => ({ kind: 'media' as const, media: { format: 'png' as const, size: { width: 20, height: 10 } }, src }),
}

test('frame page preparation resolves placed media into the document HTML', async () => {
  const page = Page.parse({ html: '<img data-segnavia-media="cover">', size: { width: 320, height: 200 } })
  expect((await expandFramePage(page, undefined, signal, placements)).page.html).toContain(`src="${src}"`)
})

test('frame book preparation resolves placed media into the document HTML', async () => {
  const view = BookView.parse({ html: '<main><img data-segnavia-media="cover"></main>' })
  expect((await expandFrameBookView(view, undefined, signal, placements)).book.html).toContain(`src="${src}"`)
})

test('Book preparation resolves placed media through the book PDF field path', async () => {
  const book = Book.parse({
    title: 'Placed',
    mode: 'paginated',
    page: { paper: 'a5', margin: { top: 12, bottom: 12, inner: 15, outer: 10 } },
    chapters: [{ title: 'One', html: '<img data-segnavia-media="cover">' }],
  })
  const expanded = await expandFrameBook(book, undefined, signal, placements)
  expect(bookDocument(expanded.book).html).toContain(`src="${src}"`)
})

test('placed page entries become designed sections before the book is built', async () => {
  const book = Book.parse({ title: 'Placed', mode: 'continuous', chapters: [{ kind: 'placed', placement: { kind: 'page', address: 'page/one' } }] })
  const expanded = await expandFrameBook(book, undefined, signal, {
    resolve: async () => ({ kind: 'page', page: Page.parse({ html: '<p>Resolved page</p>', size: { width: 320, height: 200 } }) }),
  })
  expect(bookDocument(expanded.book).html).toContain('<p>Resolved page</p>')
  expect(expanded.book.body[0]).toMatchObject({ kind: 'designed', pages: [{ html: '<p>Resolved page</p>' }] })
})

test('placed media entries use image resolution and missing reporting', async () => {
  const book = Book.parse({ title: 'Placed', mode: 'continuous', chapters: [{ kind: 'placed', placement: { kind: 'media', address: 'media/missing' } }] })
  const reports: unknown[] = []
  const expanded = await expandFrameBook(book, undefined, signal, { resolve: async () => undefined, report: (entry) => reports.push(entry) })
  expect(bookDocument(expanded.book).html).toContain('data-segnavia-placement="missing"')
  expect(reports).toEqual([{ address: 'media/missing', page: undefined, reason: 'missing' }])
})

test('chooses placement widths from print, fluid, fixed, and paginated book viewports', async () => {
  const widths: number[] = []
  const capture = {
    resolve: async (_placement: unknown, context: { width: number }) => {
      widths.push(context.width)
      return { kind: 'media' as const, media: { format: 'png' as const, size: { width: 20, height: 10 } }, src }
    },
  }
  const image = '<img data-segnavia-media="cover">'
  const printed = Page.parse({ html: image, print: { paper: 'a4' } })
  await expandFramePage(printed, undefined, signal, capture)
  await expandFramePage(Page.parse({ html: image }), undefined, signal, capture)
  await expandFramePage(Page.parse({ html: image, size: { width: 420, height: 240 } }), undefined, signal, capture)
  const book = Book.parse({
    title: 'Widths',
    mode: 'paginated',
    page: { paper: 'a5', margin: { top: 12, bottom: 12, inner: 15, outer: 10 } },
    chapters: [{ title: 'One', html: image }],
  })
  await expandFrameBook(book, undefined, signal, capture)
  if (!book.page) throw new Error('Expected the parsed paginated book to carry its page.')
  expect(widths).toEqual([
    paperPixels(sheetMm(printed.print as NonNullable<typeof printed.print>).width),
    FLUID_WIDTH,
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
  expect((await expandFramePage(page, motifs, signal, placements)).page.html).toContain(`src="${src}"`)
})

test('page parent furniture resolves placed media before document building', async () => {
  const page = Page.parse({ html: '<main>Body</main>', size: { width: 320, height: 200 } })
  const withParent = {
    ...page,
    printedPages: { parents: [{ name: 'body', head: '<img data-segnavia-media="cover">' }] },
  } as unknown as Page
  const resolved = await expandFramePage(withParent, undefined, signal, placements)
  expect(resolved.page.printedPages?.parents[0]?.head).toContain(`src="${src}"`)
})

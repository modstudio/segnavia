import { expect, test } from 'bun:test'
import { Book, Page } from '@segnavia/format'
import { bookDocument } from '@segnavia/html'
import { bookMotifRefusal, expandFrameBook, framePageMotifRefusal } from './motif-expansion.ts'

const signal = new AbortController().signal
const source = {
  motif: async (key: string) => ({
    key,
    revision: 'one',
    label: key,
    fields: [],
    versions: [{ lang: 'en', html: `<strong class="expanded-${key}">${key}</strong>` }],
    fonts: [],
  }),
}

test('expands motifs in a chapter, designed page and templated region before building the book', async () => {
  const book = Book.parse({
    title: 'Motifs',
    mode: 'paginated',
    page: { paper: 'a5', margin: { top: 12, bottom: 12, inner: 15, outer: 10 } },
    lang: 'en',
    templates: [{ name: 'feature', html: '<main data-region="body"></main>' }],
    chapters: [
      { title: 'Chapter', html: '<p data-motif="chapter">authored</p>' },
      { kind: 'designed', pages: [{ html: '<section data-motif="designed"></section>' }] },
      { kind: 'templated', template: 'feature', pages: [{ regions: { body: '<div data-motif="region"></div>' } }] },
    ],
  })

  const expanded = await expandFrameBook(book, { source }, signal)
  const html = bookDocument(expanded.book).html
  expect(html).toContain('class="expanded-chapter"')
  expect(html).toContain('class="expanded-designed"')
  expect(html).toContain('class="expanded-region"')
  expect(html).not.toContain('>authored</p>')
})

test('matches page missing-source behavior for body and parent-page placements', async () => {
  const bodyBook = Book.parse({
    title: 'Body',
    mode: 'continuous',
    chapters: [{ title: 'One', html: '<p data-motif="held"></p>' }],
  })
  const bodyPage = Page.parse({ html: '<p data-motif="held"></p>' })
  expect(bookMotifRefusal(bodyBook)).toBeUndefined()
  expect(framePageMotifRefusal(bodyPage)).toBeUndefined()
  expect((await expandFrameBook(bodyBook, undefined, signal)).book.chapters[0]).toMatchObject({ html: '<p data-motif="held"></p>' })

  const parent = { name: 'held', head: '<header data-motif="running"></header>', margin: { top: 1, bottom: 1, inner: 1, outer: 1 } }
  const parentBook = Book.parse({ title: 'Parent', mode: 'continuous', parentPages: [parent], chapters: [{ title: 'One', html: '<p></p>' }] })
  const parentPage = Page.parse({ html: '<p></p>', print: { paper: 'a4' }, printedPages: { parents: [parent], rules: { every: 'held' } } })
  expect(bookMotifRefusal(parentBook)?.message).toBe(framePageMotifRefusal(parentPage)?.message)
  expect(bookMotifRefusal(parentBook)?.message).toBe(
    'A parent-page motif placement could not establish its motif source; provide motifs.source to clear this refusal.',
  )
})

test('preserves library furniture motifs while expanding host motifs around them', async () => {
  const book = Book.parse({
    title: 'Furniture',
    mode: 'continuous',
    parentPages: [
      {
        name: 'held',
        head: '<span data-motif="segnavia:folio"></span><span data-motif="ornament"></span>',
        margin: { top: 1, bottom: 1, inner: 1, outer: 1 },
      },
    ],
    chapters: [{ title: 'One', html: '<p></p>' }],
  })
  const expanded = await expandFrameBook(book, { source }, signal)
  expect(expanded.book.parentPages[0]?.head).toContain('data-motif="segnavia:folio"')
  expect(expanded.book.parentPages[0]?.head).toContain('class="expanded-ornament"')

  const libraryOnly = Book.parse({
    ...book,
    parentPages: [{ ...book.parentPages[0], head: '<span data-motif="segnavia:folio"></span>' }],
  })
  expect(bookMotifRefusal(libraryOnly)).toBeUndefined()
})

test('refuses library motifs in chapter and designed-page bodies without a source like a page does', async () => {
  for (const chapter of [
    { title: 'Chapter', html: '<span data-motif="segnavia:folio"></span>' },
    { kind: 'designed' as const, pages: [{ html: '<span data-motif="segnavia:folio"></span>' }] },
  ]) {
    const html = '<span data-motif="segnavia:folio"></span>'
    const book = Book.parse({
      title: 'Reserved',
      mode: chapter.kind === 'designed' ? 'paginated' : 'continuous',
      ...(chapter.kind === 'designed' ? { page: { paper: 'a5', margin: { top: 12, bottom: 12, inner: 15, outer: 10 } } } : {}),
      chapters: [chapter],
    })
    const expected = framePageMotifRefusal(Page.parse({ html }))?.message
    expect(bookMotifRefusal(book)?.message).toBe(expected)
    await expect(expandFrameBook(book, undefined, signal)).rejects.toThrow(expected as string)
  }
})

test('returns motif font references from a book expansion', async () => {
  const book = Book.parse({
    title: 'Motif font',
    mode: 'continuous',
    chapters: [{ title: 'Chapter', html: '<span data-motif="letter"></span>' }],
  })
  const expanded = await expandFrameBook(
    book,
    {
      source: {
        motif: async (key) => ({
          key,
          revision: 'one',
          label: key,
          fields: [],
          versions: [{ lang: 'en', html: '<strong>Letter</strong>' }],
          fonts: [{ app: 'ornament' }],
        }),
      },
    },
    signal,
  )
  expect(expanded.fonts).toEqual([{ app: 'ornament' }])
})

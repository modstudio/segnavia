import { expect, test } from 'bun:test'
import { isPart, Page } from '@segnavia/format'
import { bookDocument, parseBookFixture, resolvePageHtml } from '@segnavia/html'
import { bookMotifRefusal, expandFrameBookValue as expandFrameBook, framePageMotifRefusal } from './motif-expansion.ts'

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
  const book = parseBookFixture({
    title: 'Motifs',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } },
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

test('expands and refuses motifs throughout a part subtree', async () => {
  const book = parseBookFixture({
    title: 'Parts',
    mode: 'continuous',
    body: [
      {
        name: 'part',
        title: 'Part',
        html: '<p data-motif="opening"></p>',
        children: [{ title: 'Chapter', html: '<p data-motif="nested"></p>' }],
      },
    ],
  })

  const expanded = await expandFrameBook(book, { source }, signal)
  const part = expanded.book.body[0]
  const child = part && isPart(part) ? part.children[0] : undefined
  expect(part && isPart(part) ? part.html : undefined).toContain('class="expanded-opening"')
  expect(child && 'html' in child ? child.html : undefined).toContain('class="expanded-nested"')

  const reserved = parseBookFixture({
    ...book,
    body: [{ name: 'part', children: [{ title: 'Chapter', html: '<span data-motif="segnavia:folio"></span>' }] }],
  })
  const expected = framePageMotifRefusal(resolvePageHtml(Page.parse({ html: '<span data-motif="segnavia:folio"></span>' })))?.message
  expect(bookMotifRefusal(reserved)?.message).toBe(expected)
  await expect(expandFrameBook(reserved, undefined, signal)).rejects.toThrow(expected as string)
})

test('matches page missing-source behavior for body and parent-page placements', async () => {
  const bodyBook = parseBookFixture({
    title: 'Body',
    mode: 'continuous',
    chapters: [{ title: 'One', html: '<p data-motif="held"></p>' }],
  })
  const bodyPage = Page.parse({ html: '<p data-motif="held"></p>' })
  expect(bookMotifRefusal(bodyBook)).toBeUndefined()
  expect(framePageMotifRefusal(resolvePageHtml(bodyPage))).toBeUndefined()
  expect((await expandFrameBook(bodyBook, undefined, signal)).book.body[0]).toMatchObject({ html: expect.stringContaining('<p data-motif="held"') })

  const parent = { name: 'held', head: '<header data-motif="running"></header>', margin: { blockStart: 1, blockEnd: 1, inlineStart: 1, inlineEnd: 1 } }
  const parentBook = parseBookFixture({ title: 'Parent', mode: 'continuous', parentPages: [parent], chapters: [{ title: 'One', html: '<p></p>' }] })
  const parentPage = Page.parse({ html: '<p></p>', print: { paper: 'a4' }, printedPages: { parents: [parent], parentRules: [{ parent: 'held' }] } })
  expect(bookMotifRefusal(parentBook)?.message).toBe(framePageMotifRefusal(resolvePageHtml(parentPage))?.message)
  expect(bookMotifRefusal(parentBook)?.message).toBe(
    'A parent-page motif placement could not establish its motif source; provide motifs.source to clear this refusal.',
  )
})

test('preserves library furniture motifs while expanding host motifs around them', async () => {
  const book = parseBookFixture({
    title: 'Furniture',
    mode: 'continuous',
    parentPages: [
      {
        name: 'held',
        head: '<span data-motif="segnavia:folio"></span><span data-motif="ornament"></span>',
        margin: { blockStart: 1, blockEnd: 1, inlineStart: 1, inlineEnd: 1 },
      },
    ],
    chapters: [{ title: 'One', html: '<p></p>' }],
  })
  const expanded = await expandFrameBook(book, { source }, signal)
  expect(expanded.book.parentPages[0]?.head).toContain('data-motif="segnavia:folio"')
  expect(expanded.book.parentPages[0]?.head).toContain('class="expanded-ornament"')

  const libraryOnly = parseBookFixture({
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
    const book = parseBookFixture({
      title: 'Reserved',
      mode: chapter.kind === 'designed' ? 'paginated' : 'continuous',
      ...(chapter.kind === 'designed' ? { page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } } } : {}),
      chapters: [chapter],
    })
    const expected = framePageMotifRefusal(resolvePageHtml(Page.parse({ html })))?.message
    expect(bookMotifRefusal(book)?.message).toBe(expected)
    await expect(expandFrameBook(book, undefined, signal)).rejects.toThrow(expected as string)
  }
})

test('returns motif font references from a book expansion', async () => {
  const book = parseBookFixture({
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

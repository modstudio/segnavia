import { expect, test } from 'bun:test'
import { Book, BookViewPagination, resolveBookPagination } from './index.ts'

test('resolved pagination stores declarations only and round-trips through its parser', () => {
  const pagination = resolveBookPagination(
    Book.parse({
      title: 'Book',
      mode: 'paginated',
      page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } },
      body: [{ id: 'chapter', title: 'Chapter', html: '<p>Text</p>', contents: true }],
      variables: [{ name: 'topic', kind: 'text', from: 'content' }],
      headTemplates: [{ name: 'topic-head', parts: [{ variable: 'topic' }] }],
    }),
  )
  expect(pagination?.variables.map(({ name }) => name)).toEqual(['topic'])
  expect(pagination?.headTemplates.map(({ name }) => name)).toEqual(['topic-head'])
  if (!pagination) throw new Error('Expected paginated book values.')
  expect(BookViewPagination.parse(JSON.parse(JSON.stringify(pagination)))).toEqual(pagination)
})

test('book-view pagination refuses undeclared variables and author library names', () => {
  const book = Book.parse({
    title: 'Book',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } },
    body: [{ id: 'chapter', title: 'Chapter', html: '<p>Text</p>', contents: true }],
  })
  const pagination = resolveBookPagination(book)
  if (!pagination) throw new Error('Expected paginated book values.')
  expect(() => BookViewPagination.parse({ ...pagination, headTemplates: [{ name: 'h', parts: [{ variable: 'missing' }] }] })).toThrow(
    'head template names undeclared variable',
  )
  expect(() => BookViewPagination.parse({ ...pagination, headTemplates: [{ name: 'segnavia:copy', parts: [] }] })).toThrow(
    'reserved for the library; rename it without the segnavia: prefix',
  )
})

test('book parsing refuses unclosed head-template placements whether or not their template is declared', () => {
  const parentPages = [
    {
      name: 'body',
      head: '<div data-motif="segnavia:head-template" data-motif-name="missing">',
      margin: { blockStart: 1, blockEnd: 1, inlineStart: 1, inlineEnd: 1 },
    },
  ]
  const input = { title: 'Book', mode: 'continuous' as const, body: [{ id: 'chapter', title: 'Chapter', html: '<p>Text</p>' }], parentPages }
  expect(() => Book.parse(input)).toThrow(/undeclared template.*missing/)
  expect(() => Book.parse({ ...input, headTemplates: [{ name: 'missing', parts: [] }] })).toThrow(/missing.*close the element/)
})

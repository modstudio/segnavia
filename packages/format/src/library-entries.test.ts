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

import { expect, test } from 'bun:test'
import { Book, resolveBookPagination } from '@segnavia/format'
import { composerPageGeometries, composerPageRules } from './book-page-geometries.ts'

test('builds geometry-specific default parents and named page rules', () => {
  const book = Book.parse({
    title: 'Book',
    mode: 'paginated',
    page: { paper: 'letter', margin: { blockStart: 10, blockEnd: 10, inlineStart: 12, inlineEnd: 14 } },
    style: {
      pageGeometries: {
        wide: {
          paper: 'letter',
          orientation: 'landscape',
          margin: { blockStart: 20, blockEnd: 20, inlineStart: 30, inlineEnd: 30 },
          columns: { count: 2, gap: 8 },
        },
      },
    },
    chapters: [{ id: 'one', title: 'One', html: '<p>Text</p>' }],
  })
  const pagination = resolveBookPagination(book)
  if (!pagination) throw new Error('missing pagination')
  const geometries = composerPageGeometries(pagination)
  expect(geometries).toHaveLength(2)
  expect(geometries[1]).toMatchObject({ name: 'wide', pageName: 'segnavia-page-2', columnGap: 8 * (96 / 25.4) })
  expect(geometries[1]?.parents.find((parent) => parent.name === 'segnavia:recto')?.margin.inlineStart).toBe(30 * (96 / 25.4))
  expect(composerPageRules(pagination, geometries)).toContain('@page segnavia-page-2{size:279.4mm 215.9mm;margin:0}')
})

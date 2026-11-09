import { describe, expect, test } from 'bun:test'
import { bookPlanDocumentNumbers } from './book-plan-document-numbers.ts'
import { bookPlanFolios } from './book-plan-folios.ts'
import { block, flow, input, settings } from './paginate-book.test-helper.ts'
import { paginateBook } from './paginate-book.ts'
import { planBook } from './plan-book.ts'

describe('planBook', () => {
  test.each([
    {
      name: 'left-to-right Arabic',
      direction: 'ltr' as const,
      frontMatter: 'roman-lower' as const,
      body: 'arabic' as const,
      expectedFolios: ['i', null, '1'],
    },
    {
      name: 'right-to-left Hebrew',
      direction: 'rtl' as const,
      frontMatter: 'hebrew' as const,
      body: 'hebrew' as const,
      expectedFolios: ['א', null, 'א'],
    },
  ])('combines the existing pagination and folio plans for $name books', ({ direction, frontMatter, body, expectedFolios }) => {
    const measurements = input({
      flows: [flow('front', 'front', [block('text', 'p', 0, 1, 1, 0)], 'Front'), flow('body', 'chapter', [block('text', 'p', 1, 1, 1, 0)], 'Body')],
      settings: { ...settings, direction },
    })
    const paginated = paginateBook(measurements)
    const folios = bookPlanFolios(paginated.pages, { frontMatter, body })
    const documentNumbers = bookPlanDocumentNumbers(paginated.pages, { frontMatter, body }, measurements.flows)
    const result = planBook(measurements, { frontMatter, body })
    expect(result).toEqual({
      ok: true,
      plan: { version: 3, pages: paginated.pages, ...folios, ...documentNumbers },
    })
    expect(result.ok && result.plan.folios).toEqual([...expectedFolios])
    expect(result.ok && result.plan.total).toBe(direction === 'ltr' ? '1' : 'א')
  })

  test('returns pagination refusals instead of a partial plan', () => {
    const figure = block('figure', 'img', 1, 2, 1, 0, { columns: 2, lines: [{ top: 0, bottom: 80 }] })
    const measurements = input({ flows: [flow('c1', 'chapter', [figure])] })
    const paginated = paginateBook(measurements)
    const result = planBook(measurements, { frontMatter: 'roman-lower', body: 'arabic' })
    expect(paginated.refusals).not.toHaveLength(0)
    expect(result).toEqual({
      ok: false,
      refusals: paginated.refusals,
    })
  })

  test('resolves folio and page-count variables by numbering, document and record', () => {
    const measurements = input({
      variables: [
        { name: 'folio', kind: 'folio', of: 'numbering' },
        { name: 'document-folio', kind: 'folio', of: 'document' },
        { name: 'record-folio', kind: 'folio', of: 'record' },
        { name: 'pages', kind: 'pages', of: 'numbering' },
        { name: 'document-pages', kind: 'pages', of: 'document' },
        { name: 'record-pages', kind: 'pages', of: 'record' },
      ],
      flows: [{ ...flow('record', 'chapter', [block('text', 'p', 1, 1, 6, 0)]), record: { index: 1, count: 1 } }],
    })
    const result = planBook(measurements, { frontMatter: 'roman-lower', body: 'arabic' })
    expect(result.ok && result.plan.pages.map((page) => page.variables)).toEqual([
      { folio: '1', 'document-folio': '1', 'record-folio': '1', pages: '2', 'document-pages': '2', 'record-pages': '2' },
      { folio: '2', 'document-folio': '2', 'record-folio': '2', pages: '2', 'document-pages': '2', 'record-pages': '2' },
    ])
  })
})

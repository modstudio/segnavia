import { describe, expect, test } from 'bun:test'
import { bookPlanDocumentNumbers } from './book-plan-document-numbers.ts'
import { bookPlanFolios } from './book-plan-folios.ts'
import { resolveHeadTemplate } from './head-template.ts'
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
    const total = direction === 'ltr' ? '1' : 'א'
    expect(result).toEqual({
      ok: true,
      plan: {
        version: 5,
        pages: paginated.pages.map((page, index) => ({
          ...page,
          variables: { ...(expectedFolios[index] ? { 'segnavia:folio': expectedFolios[index] } : {}), 'segnavia:pages-total': total },
        })),
        ...folios,
        ...documentNumbers,
      },
    })
    expect(result.ok && result.plan.folios).toEqual([...expectedFolios])
    expect(result.ok && result.plan.total).toBe(total)
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
      flows: [
        flow('front', 'front', [block('text', 'p', 1, 1, 1, 0)]),
        flow('introduction', 'chapter', [block('text', 'p', 2, 1, 1, 0)]),
        { ...flow('record', 'chapter', [block('text', 'p', 3, 1, 6, 0)]), record: { index: 1, count: 1 } },
      ],
    })
    const result = planBook(measurements, { frontMatter: 'roman-lower', body: 'arabic' })
    expect(result.ok && result.plan.pages.filter((page) => page.flow === 'record').map((page) => page.variables)).toEqual([
      {
        folio: '2',
        'document-folio': '3',
        'record-folio': '1',
        pages: '3',
        'document-pages': '4',
        'record-pages': '2',
        'segnavia:folio': '2',
        'segnavia:pages-total': '3',
      },
      {
        folio: '3',
        'document-folio': '4',
        'record-folio': '2',
        pages: '3',
        'document-pages': '4',
        'record-pages': '2',
        'segnavia:folio': '3',
        'segnavia:pages-total': '3',
      },
    ])
  })

  test('formats record variables in arabic by default and in a named number system', () => {
    const measurements = input({
      variables: [
        { name: 'index', kind: 'record', value: 'index' },
        { name: 'count', kind: 'record', value: 'count', system: 'hebrew' },
      ],
      flows: [{ ...flow('record', 'chapter', [block('text', 'p', 1, 1, 1, 0)]), record: { index: 3, count: 10 } }],
    })
    const result = planBook(measurements, { frontMatter: 'roman-lower', body: 'hebrew' })
    expect(result.ok && result.plan.pages[0]?.variables).toMatchObject({ index: '3', count: 'י' })
  })

  test('resolves document metadata variables identically on every page', () => {
    const measurements = input({
      document: { lang: 'en', metadata: { title: 'The Book', authors: ['Ada', 'Ben'], extra: { edition: 'Second' } } },
      variables: [
        { name: 'title', kind: 'meta', field: 'title' },
        { name: 'authors', kind: 'meta', field: 'authors' },
        { name: 'edition', kind: 'meta', field: 'edition' },
      ],
      flows: [flow('chapter', 'chapter', [block('text', 'p', 1, 1, 6, 0)])],
    })
    const result = planBook(measurements, { frontMatter: 'roman-lower', body: 'arabic' })
    expect(result.ok && result.plan.pages.map(({ variables }) => variables)).toEqual([
      expect.objectContaining({ title: 'The Book', authors: 'Ada and Ben', edition: 'Second' }),
      expect.objectContaining({ title: 'The Book', authors: 'Ada and Ben', edition: 'Second' }),
    ])
  })

  test.each([
    { lang: 'en', title: 'The Book of Tides', section: 'Beginning', titleDir: 'ltr', sectionDir: 'ltr' },
    { lang: 'he', title: 'ספר ההפלגה', section: 'התחלה', titleDir: 'rtl', sectionDir: 'rtl' },
  ])('carries the book and section titles into $lang heads with their own directions', ({ lang, title, section, titleDir, sectionDir }) => {
    const measurements = input({
      document: { lang, metadata: { title } },
      variables: [
        { name: 'book-title', kind: 'meta', field: 'title' },
        { name: 'section-title', kind: 'text', from: 'section-title', pick: 'first' },
      ],
      flows: [
        flow('chapter', 'chapter', [block('heading', 'h1', 1, 1, 1, 0, { variables: [{ name: 'section-title', value: section, line: 0, scope: 'flow' }] })]),
      ],
    })
    const result = planBook(measurements, { frontMatter: 'roman-lower', body: 'arabic' })
    if (!result.ok) throw new Error(result.refusals[0]?.message)
    const values = result.plan.pages[0]?.variables ?? {}
    expect(
      resolveHeadTemplate(
        { name: 'book', parts: [{ variable: 'book-title' }], separator: '', dropEmpty: true, collapseEqual: true },
        values,
        {},
        undefined,
        lang,
      ),
    ).toBe(`<bdi dir="${titleDir}">${title}</bdi>`)
    expect(
      resolveHeadTemplate(
        { name: 'section', parts: [{ variable: 'section-title' }], separator: '', dropEmpty: true, collapseEqual: true },
        values,
        {},
        undefined,
        lang,
      ),
    ).toBe(`<bdi dir="${sectionDir}">${section}</bdi>`)
  })

  test('counts a record opener blank in its folio and total without showing a value on the blank', () => {
    const measurements = input({
      settings,
      variables: [
        { name: 'record-folio', kind: 'folio', of: 'record' },
        { name: 'record-pages', kind: 'pages', of: 'record' },
      ],
      flows: [
        flow('first', 'chapter', [block('text', 'p', 1, 1, 1, 0)]),
        { ...flow('record', 'chapter', [block('text', 'p', 2, 1, 1, 0)]), record: { index: 1, count: 1 } },
      ],
    })
    const result = planBook(measurements, { frontMatter: 'roman-lower', body: 'arabic' })
    expect(result.ok && result.plan.pages.filter((page) => page.flow === 'record').map((page) => page.variables)).toEqual([
      { 'record-pages': '2', 'segnavia:pages-total': '3' },
      { 'record-folio': '2', 'record-pages': '2', 'segnavia:folio': '3', 'segnavia:pages-total': '3' },
    ])
  })

  test('selects start and last text values into the page variables', () => {
    const measurements = input({
      variables: [
        { name: 'opening', kind: 'text', from: 'content', pick: 'start' },
        { name: 'closing', kind: 'text', from: 'content', pick: 'last' },
      ],
      flows: [
        flow('chapter', 'chapter', [
          block('text', 'p', 1, 1, 3, 0, {
            variables: [
              { name: 'opening', value: 'First line', line: 0 },
              { name: 'opening', value: 'Middle', line: 1 },
              { name: 'closing', value: 'First line', line: 0 },
              { name: 'closing', value: 'Middle', line: 1 },
            ],
          }),
        ]),
      ],
    })
    const result = planBook(measurements, { frontMatter: 'roman-lower', body: 'arabic' })
    expect(result.ok && result.plan.pages[0]?.variables).toEqual({
      opening: 'First line',
      closing: 'Middle',
      'segnavia:folio': '1',
      'segnavia:pages-total': '1',
    })
  })
})

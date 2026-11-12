import { describe, expect, test } from 'bun:test'
import { bookPlanFolios } from './book-plan-folios.ts'

describe('bookPlanFolios', () => {
  test('restarts in the body system while totaling all pages in that system', () => {
    expect(
      bookPlanFolios(
        [
          { sequence: 'front', flow: 'cover', blank: false },
          { sequence: 'front', flow: 'contents', blank: false },
          { sequence: 'body', flow: 'one', blank: false },
          { sequence: 'body', flow: 'one', blank: false },
        ],
        {
          frontMatter: 'roman-lower',
          body: 'hebrew',
        },
      ),
    ).toEqual({ folios: ['i', 'ii', 'א', 'ב'], folioPrints: [true, true, true, true], total: 'ב' })
  })

  test('hides front-matter folios without changing Hebrew body folios', () => {
    const pages = [
      { sequence: 'front', flow: 'preface', blank: false },
      { sequence: 'front', flow: 'contents', blank: false },
      { sequence: 'body', flow: 'one', blank: false },
      { sequence: 'body', flow: 'one', blank: false },
    ] as const
    expect(
      bookPlanFolios(pages, {
        frontMatter: 'arabic',
        body: 'hebrew',
        printed: { frontMatter: false, body: true },
      }),
    ).toEqual({ folios: [null, null, 'א', 'ב'], folioPrints: [false, false, true, true], total: 'ב' })
  })

  test('hides body folios without changing front folios or the counted body total', () => {
    const pages = [
      { sequence: 'front', flow: 'preface', blank: false },
      { sequence: 'front', flow: 'contents', blank: false },
      { sequence: 'body', flow: 'one', blank: false },
      { sequence: 'body', flow: 'one', blank: false },
    ] as const
    expect(
      bookPlanFolios(pages, {
        frontMatter: 'roman-lower',
        body: 'hebrew',
        printed: { frontMatter: true, body: false },
      }),
    ).toEqual({ folios: ['i', 'ii', null, null], folioPrints: [true, true, false, false], total: 'ב' })
  })

  test('keeps the previous empty-plan total', () => {
    expect(bookPlanFolios([], { frontMatter: 'roman-lower', body: 'hebrew' })).toEqual({ folios: [], folioPrints: [], total: '0' })
  })

  test('skips uncounted sections and restarts a later section without Hebrew gaps', () => {
    const pages = [
      { sequence: 'front', flow: 'cover', blank: false },
      { sequence: 'front', flow: 'inside-cover', blank: false },
      { sequence: 'front', flow: 'contents', blank: false },
      { sequence: 'front', flow: 'contents', blank: false },
      { sequence: 'front', flow: 'appendix', blank: false },
    ]
    expect(
      bookPlanFolios(pages, { frontMatter: 'hebrew', body: 'arabic' }, [
        { id: 'cover', numbering: { counted: false } },
        { id: 'inside-cover', numbering: { counted: false } },
        { id: 'contents' },
        { id: 'appendix', numbering: { restart: 8 } },
      ]),
    ).toEqual({ folios: [null, null, 'א', 'ב', 'ח'], folioPrints: [null, null, true, true, true], total: 'ח' })
  })

  test('restarts only the first non-blank page of a section', () => {
    expect(
      bookPlanFolios(
        [
          { sequence: 'body', flow: 'one', blank: false },
          { sequence: 'body', flow: 'two', blank: false },
          { sequence: 'body', flow: 'two', blank: false },
          { sequence: 'body', flow: 'two', blank: false },
        ],
        { frontMatter: 'roman-lower', body: 'arabic' },
        [{ id: 'two', numbering: { restart: 8 } }],
      ),
    ).toEqual({ folios: ['1', '8', '9', '10'], folioPrints: [true, true, true, true], total: '10' })
  })

  test('continues after an uncounted section from the last counted page', () => {
    expect(
      bookPlanFolios(
        [
          { sequence: 'body', flow: 'one', blank: false },
          { sequence: 'body', flow: 'cover', blank: false },
          { sequence: 'body', flow: 'cover', blank: false },
          { sequence: 'body', flow: 'two', blank: false },
        ],
        { frontMatter: 'roman-lower', body: 'arabic' },
        [{ id: 'cover', numbering: { counted: false } }],
      ),
    ).toEqual({ folios: ['1', null, null, '2'], folioPrints: [true, null, null, true], total: '2' })
  })

  test('counts an opener blank before restarting the first visible page', () => {
    expect(
      bookPlanFolios(
        [
          { sequence: 'body', flow: 'one', blank: false },
          { sequence: 'body', flow: 'two', blank: true },
          { sequence: 'body', flow: 'two', blank: false },
          { sequence: 'body', flow: 'two', blank: false },
        ],
        { frontMatter: 'roman-lower', body: 'arabic' },
        [{ id: 'two', numbering: { restart: 8 } }],
      ),
    ).toEqual({ folios: ['1', null, '8', '9'], folioPrints: [true, null, true, true], total: '9' })
  })

  test('does not count an opener blank in an uncounted section', () => {
    expect(
      bookPlanFolios(
        [
          { sequence: 'body', flow: 'one', blank: false },
          { sequence: 'body', flow: 'cover', blank: true },
          { sequence: 'body', flow: 'cover', blank: false },
          { sequence: 'body', flow: 'two', blank: false },
        ],
        { frontMatter: 'roman-lower', body: 'arabic' },
        [{ id: 'cover', numbering: { counted: false } }],
      ),
    ).toEqual({ folios: ['1', null, null, '2'], folioPrints: [true, null, null, true], total: '2' })
  })

  test('counts an opener blank without showing its folio', () => {
    expect(
      bookPlanFolios(
        [
          { sequence: 'body', flow: 'one', blank: false },
          { sequence: 'body', flow: 'two', blank: true },
          { sequence: 'body', flow: 'two', blank: false },
        ],
        { frontMatter: 'roman-lower', body: 'arabic' },
      ),
    ).toEqual({ folios: ['1', null, '3'], folioPrints: [true, null, true], total: '3' })
  })

  test('includes a trailing counted blank in the total', () => {
    expect(
      bookPlanFolios(
        [
          { sequence: 'body', flow: 'chapter', blank: false },
          { sequence: 'body', flow: 'chapter', blank: true },
        ],
        { frontMatter: 'roman-lower', body: 'arabic' },
      ),
    ).toEqual({ folios: ['1', null], folioPrints: [true, null], total: '2' })
  })

  test('uses the last body folio as the total after front matter', () => {
    expect(
      bookPlanFolios(
        [
          { sequence: 'front', flow: 'preface', blank: false },
          { sequence: 'front', flow: 'preface', blank: false },
          { sequence: 'body', flow: 'chapter', blank: false },
          { sequence: 'body', flow: 'chapter', blank: false },
        ],
        { frontMatter: 'roman-lower', body: 'arabic' },
      ),
    ).toEqual({ folios: ['i', 'ii', '1', '2'], folioPrints: [true, true, true, true], total: '2' })
  })

  test('keeps an uncounted cover out of Hebrew body folios and total', () => {
    expect(
      bookPlanFolios(
        [
          { sequence: 'body', flow: 'cover', blank: false },
          { sequence: 'body', flow: 'chapter', blank: false },
          { sequence: 'body', flow: 'chapter', blank: false },
        ],
        { frontMatter: 'hebrew', body: 'hebrew' },
        [{ id: 'cover', numbering: { counted: false } }],
      ),
    ).toEqual({ folios: [null, 'א', 'ב'], folioPrints: [null, true, true], total: 'ב' })
  })
})

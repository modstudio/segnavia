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
    ).toEqual({ folios: ['i', 'ii', 'א', 'ב'], total: 'ב' })
  })

  test('keeps the previous empty-plan total', () => {
    expect(bookPlanFolios([], { frontMatter: 'roman-lower', body: 'hebrew' })).toEqual({ folios: [], total: '0' })
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
    ).toEqual({ folios: [null, null, 'א', 'ב', 'ח'], total: 'ח' })
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
    ).toEqual({ folios: ['1', '8', '9', '10'], total: '10' })
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
    ).toEqual({ folios: ['1', null, null, '2'], total: '2' })
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
    ).toEqual({ folios: ['1', null, '8', '9'], total: '9' })
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
    ).toEqual({ folios: ['1', null, null, '2'], total: '2' })
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
    ).toEqual({ folios: ['1', null, '3'], total: '3' })
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
    ).toEqual({ folios: ['i', 'ii', '1', '2'], total: '2' })
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
    ).toEqual({ folios: [null, 'א', 'ב'], total: 'ב' })
  })
})

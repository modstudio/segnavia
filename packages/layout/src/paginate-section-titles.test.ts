import { expect, test } from 'bun:test'
import { SECTION_TITLE_MARK } from '@segnavia/format'
import { block, flow, input } from './paginate-book.test-helper.ts'
import { paginateBook } from './paginate-book.ts'

test('carries section-title marks across pages and takes the first new title on a shared page', () => {
  const title = SECTION_TITLE_MARK
  const pages = paginateBook(
    input({
      flows: [
        flow('shared', 'chapter', [
          block('text', 'div', 1, 1, 1, 0, { marks: [{ name: title, value: 'One', line: 0 }] }),
          block('text', 'p', 1, 2, 7, 10),
          block('text', 'div', 2, 3, 1, 80, { marks: [{ name: title, value: 'Two', line: 0 }] }),
          block('text', 'p', 2, 4, 7, 90),
        ]),
      ],
    }),
  ).pages
  expect(pages.map((page) => page.marks?.[title]?.first)).toEqual(['One', 'Two', 'Two', 'Two'])
})

test('scopes a continuing section title to its joined flow', () => {
  const pages = paginateBook(
    input({
      flows: [
        flow(
          'shared',
          'chapter',
          [
            block('text', 'p', 1, 1, 7, 0),
            block('text', 'div', 2, 2, 1, 70, { marks: [{ name: SECTION_TITLE_MARK, value: 'Two', line: 0 }] }),
            block('text', 'p', 2, 3, 7, 80),
          ],
          'One',
        ),
        flow('three', 'chapter', [block('text', 'p', 3, 1, 7, 0)], 'Three'),
        { id: 'designed', kind: 'fixed', pages: 1, runningHead: 'Designed' },
      ],
    }),
  ).pages
  expect(pages.filter((page) => page.flow === 'shared').map((page) => page.marks?.[SECTION_TITLE_MARK]?.first)).toEqual([undefined, 'Two', 'Two'])
  expect(pages.filter((page) => page.flow === 'three').every((page) => page.marks?.[SECTION_TITLE_MARK] === undefined)).toBe(true)
  expect(pages.filter((page) => page.flow === 'designed').every((page) => page.marks?.[SECTION_TITLE_MARK] === undefined)).toBe(true)
})

import { expect, test } from 'bun:test'
import { bookPlanDocumentNumbers } from './book-plan-document-numbers.ts'

const page = (flow: string, blank = false, sequence = 'body') => ({ flow, blank, sequence })

test('numbers the document and totals three restarted record flows', () => {
  const pages = ['a', 'a', 'b', 'c', 'c', 'c'].map((flow) => page(flow))
  const sections = [
    { id: 'a', numbering: { restart: 1 }, record: { index: 1, count: 3 } },
    { id: 'b', numbering: { restart: 1 }, record: { index: 2, count: 3 } },
    { id: 'c', numbering: { restart: 1 }, record: { index: 3, count: 3 } },
  ]
  expect(bookPlanDocumentNumbers(pages, { frontMatter: 'roman-lower', body: 'arabic' }, sections)).toEqual({
    documentFolios: ['1', '2', '3', '4', '5', '6'],
    documentTotal: '6',
    recordTotals: { a: '2', b: '1', c: '3' },
    records: { a: { index: '1', count: '3' }, b: { index: '2', count: '3' }, c: { index: '3', count: '3' } },
  })
})

test('writes Hebrew document and record numbers', () => {
  expect(
    bookPlanDocumentNumbers([page('a'), page('a')], { frontMatter: 'arabic', body: 'hebrew' }, [
      { id: 'a', numbering: { restart: 1 }, record: { index: 1, count: 1 } },
    ]),
  ).toEqual({ documentFolios: ['א', 'ב'], documentTotal: 'ב', recordTotals: { a: 'ב' }, records: { a: { index: 'א', count: 'א' } } })
})

test('advances a counted blank and skips an uncounted cover', () => {
  expect(
    bookPlanDocumentNumbers([page('cover', false, 'front'), page('a', true), page('a')], { frontMatter: 'roman-lower', body: 'arabic' }, [
      { id: 'cover', numbering: { counted: false } },
      { id: 'a', record: { index: 1, count: 1 } },
    ]),
  ).toEqual({ documentFolios: [null, null, '2'], documentTotal: '2', recordTotals: { a: '2' }, records: { a: { index: '1', count: '1' } } })
})

test('uses the body system for a counted front-matter paper', () => {
  expect(bookPlanDocumentNumbers([page('front', false, 'front')], { frontMatter: 'roman-lower', body: 'hebrew' })).toEqual({
    documentFolios: ['א'],
    documentTotal: 'א',
    recordTotals: {},
    records: {},
  })
})

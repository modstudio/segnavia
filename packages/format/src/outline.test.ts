import { expect, test } from 'bun:test'
import { documentOutline, type OutlineSource } from './outline.ts'
import type { Plan } from './plan.ts'

const heading = (id: string, level: number, listed = { contents: true, outline: true }) => ({ id, title: id, level, listed, block: id })
const source = (headings: OutlineSource['headings'], depth = 6): OutlineSource => ({
  direction: 'ltr',
  depth,
  headings,
  blocks: ['one', 'text', 'three', 'four'],
})
const plan = {
  pages: [{ start: { id: 'one' } }, { start: { id: 'three' } }],
} as unknown as Plan

test('outline depth follows nesting and skips absent heading ranks', () => {
  const outline = documentOutline(source([heading('one', 1), heading('three', 3), heading('four', 4)]))
  expect(outline.map(({ id, level, depth }) => ({ id, level, depth }))).toEqual([
    { id: 'one', level: 1, depth: 1 },
    { id: 'three', level: 3, depth: 2 },
    { id: 'four', level: 4, depth: 3 },
  ])
})

test('outline depth and listing independently remove entries', () => {
  const outline = documentOutline(source([heading('one', 1), heading('three', 3), heading('four', 4, { contents: true, outline: false })], 2))
  expect(outline.map(({ id }) => id)).toEqual(['one', 'three'])
})

test('outline pages follow each physical page first block through document order', () => {
  expect(documentOutline(source([heading('one', 1), heading('three', 2), heading('four', 2)]), plan).map(({ id, page }) => ({ id, page }))).toEqual([
    { id: 'one', page: 1 },
    { id: 'three', page: 2 },
    { id: 'four', page: 2 },
  ])
})

test('an id-less page start is a barrier instead of guessing the previous page (mutation: ignore the barrier)', () => {
  const barrierPlan = {
    pages: [{ start: { id: 'one' } }, { start: {} }, { start: { id: 'three' } }],
  } as unknown as Plan
  expect(documentOutline(source([heading('one', 1), heading('text', 2), heading('three', 2)]), barrierPlan)).toEqual([
    { id: 'one', title: 'one', level: 1, depth: 1, page: 1 },
    { id: 'text', title: 'text', level: 2, depth: 2 },
    { id: 'three', title: 'three', level: 2, depth: 2, page: 3 },
  ])
})

test('a right-to-left outline preserves Hebrew and digit-only titles', () => {
  const outline = documentOutline({
    direction: 'rtl',
    depth: 6,
    blocks: ['hebrew', 'digits'],
    headings: [
      { ...heading('hebrew', 1), title: 'בראשית 1' },
      { ...heading('digits', 2), title: '123' },
    ],
  })
  expect(outline.map(({ title, depth }) => ({ title, depth }))).toEqual([
    { title: 'בראשית 1', depth: 1 },
    { title: '123', depth: 2 },
  ])
})

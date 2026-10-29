import { expect, test } from 'bun:test'
import { chapterOpenings } from './chapter-openings.ts'

test('requires at least one located chapter and makes every located opening vote', () => {
  expect(chapterOpenings([], true)).toEqual({ rectoOpenings: false, verso: [] })
  expect(
    chapterOpenings(
      [
        { story: 'one', page: '1', role: 'recto' },
        { story: 'two', page: '2', role: 'recto' },
      ],
      true,
    ),
  ).toEqual({ rectoOpenings: true, verso: [] })
  expect(
    chapterOpenings(
      [
        { story: 'one', page: '1', role: 'recto' },
        { story: 'two', page: '2', role: 'verso' },
      ],
      true,
    ),
  ).toEqual({ rectoOpenings: false, verso: [{ story: 'two', page: '2' }] })
})

test('single-sided chapters neither enable recto openings nor report versos', () => {
  expect(chapterOpenings([{ story: 'chapter', page: '2', role: 'verso' }], false)).toEqual({ rectoOpenings: false, verso: [] })
})

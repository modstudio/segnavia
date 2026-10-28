import { expect, test } from 'bun:test'
import { modelToBook } from './map-book.ts'
import type { IdmlModel } from './model.ts'

test('maps document setup and orders placeholder chapters by first page', () => {
  const model: IdmlModel = {
    id: 'book',
    preferences: {
      pageWidth: 396,
      pageHeight: 612,
      facingPages: true,
      binding: 'right-to-left',
      margin: { top: 36, bottom: 36, left: 30, right: 40 },
    },
    spreads: [{ id: 'spread', pages: [{ id: 'page', stories: ['later', 'earlier'] }] }],
    masterSpreads: [],
    stories: [
      { id: 'earlier', part: 'Stories/earlier.xml' },
      { id: 'later', part: 'Stories/later.xml' },
      { id: 'master', part: 'Stories/master.xml' },
    ],
    masterStoryIds: ['master'],
    partsRead: [],
    unsupportedElements: {},
  }
  const book = modelToBook(model)
  expect(book).toMatchObject({
    title: 'book',
    mode: 'paginated',
    dir: 'rtl',
    rectoOpenings: true,
    page: { paper: { width: 396, height: 612, unit: 'pt' } },
  })
  expect(book.page?.margin.inner).toBeCloseTo(40 * (25.4 / 72))
  expect(book.page?.margin.outer).toBeCloseTo(30 * (25.4 / 72))
  expect(book.chapters.map((chapter) => chapter.title)).toEqual(['later', 'earlier'])
  expect(book.chapters[0]).toMatchObject({ html: '<p><br></p>' })
})

test('maps left binding, asymmetric margins, and non-facing pages', () => {
  const model: IdmlModel = {
    id: 'left-bound',
    preferences: {
      pageWidth: 396,
      pageHeight: 612,
      facingPages: false,
      binding: 'left-to-right',
      margin: { top: 10, bottom: 20, left: 30, right: 40 },
    },
    spreads: [],
    masterSpreads: [],
    stories: [{ id: 'story', part: 'Stories/story.xml' }],
    masterStoryIds: [],
    partsRead: [],
    unsupportedElements: {},
  }
  const book = modelToBook(model)
  expect(book.dir).toBe('ltr')
  expect(book.rectoOpenings).toBe(false)
  expect(book.page?.margin.inner).toBeCloseTo(30 * (25.4 / 72))
  expect(book.page?.margin.outer).toBeCloseTo(40 * (25.4 / 72))
})

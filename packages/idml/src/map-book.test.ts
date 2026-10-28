import { expect, test } from 'bun:test'
import { modelToBook } from './map-book.ts'
import type { IdmlModel } from './model.ts'
import { ReportCollector } from './report.ts'

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
      { id: 'earlier', part: 'Stories/earlier.xml', frame: { columns: 2, gutter: 12, location: 'earlier-frame' } },
      { id: 'later', part: 'Stories/later.xml', frame: { columns: 2, gutter: 12, location: 'later-frame' } },
      { id: 'master', part: 'Stories/master.xml' },
    ],
    masterStoryIds: ['master'],
    partsRead: [],
    unsupportedElements: {},
    bodyFramePreferences: [
      { columns: 2, gutter: 12, location: 'frame-12-a' },
      { columns: 2, gutter: 12, location: 'frame-12-b' },
      { columns: 2, gutter: 10, location: 'frame-10-a' },
      { columns: 2, gutter: 10, location: 'frame-10-b' },
      { columns: 2, gutter: 14, location: 'frame-14' },
      { columns: 1, gutter: 0, location: 'frame-single' },
    ],
  }
  const report = new ReportCollector()
  const book = modelToBook(model, report)
  expect(book).toMatchObject({
    title: 'book',
    mode: 'paginated',
    dir: 'rtl',
    rectoOpenings: true,
    page: { paper: { width: 396, height: 612, unit: 'pt' } },
  })
  expect(book.page?.margin.inner).toBeCloseTo(40 * (25.4 / 72))
  expect(book.page?.margin.outer).toBeCloseTo(30 * (25.4 / 72))
  expect(book.page?.columnGap).toBeCloseTo(12 * (25.4 / 72))
  expect(report.data().unsupportedElements['differing body frame gutters']).toBe(2)
  expect(report.data().locations['element:differing body frame gutters']).toEqual(['frame-10-a', 'frame-14'])
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

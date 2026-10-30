import { expect, test } from 'bun:test'
import { modelToBook } from './map-book.ts'
import type { IdmlModel } from './model.ts'
import { ReportCollector } from './report.ts'
import type { IdmlStory } from './types.ts'

const story = (id: string, text = id): IdmlStory => ({
  id,
  part: `Stories/${id}.xml`,
  root: {
    name: 'Story',
    attributes: {},
    location: `Stories/${id}.xml`,
    children: [{ name: 'Content', attributes: {}, location: `Stories/${id}.xml#content`, children: [], text }],
  },
})

function model(
  pages: IdmlModel['spreads'][number]['pages'],
  stories: IdmlStory[],
  options: { facingPages?: boolean; binding?: IdmlModel['preferences']['binding'] } = {},
): IdmlModel {
  return {
    id: 'openings',
    preferences: {
      pageWidth: 100,
      pageHeight: 100,
      facingPages: options.facingPages ?? true,
      binding: options.binding ?? 'left-to-right',
      margin: { top: 10, bottom: 10, left: 10, right: 10 },
    },
    spreads: [{ id: 'spread', pages }],
    masterSpreads: [],
    stories,
    masterStoryIds: [],
    partsRead: [],
  }
}

test('disables recto openings and reports each chapter that starts on a verso', () => {
  const report = new ReportCollector()
  const book = modelToBook(
    model(
      [
        { id: 'recto-page', stories: ['recto'], side: 'right' },
        { id: 'verso-page', stories: ['verso'], side: 'left' },
      ],
      [story('recto'), story('verso')],
    ),
    report,
  )

  expect(book.rectoOpenings).toBe(false)
  expect(report.data().versoOpenings).toEqual({ verso: ['verso-page'] })
})

test('treats a left page as recto for right-to-left binding', () => {
  const report = new ReportCollector()
  const book = modelToBook(model([{ id: 'left-page', stories: ['chapter'], side: 'left' }], [story('chapter')], { binding: 'right-to-left' }), report)

  expect(book.rectoOpenings).toBe(true)
  expect(report.data().versoOpenings).toEqual({})
})

test('ignores a verso-opening story claimed into a title block', () => {
  const header = story('header', 'Head')
  const body = story('body', 'A much longer body story')
  const pages: IdmlModel['spreads'][number]['pages'] = [
    { id: 'header-page', stories: ['header'], side: 'left' },
    {
      id: 'body-page',
      stories: ['body'],
      side: 'right',
      bodyFrames: [
        { story: 'header', location: 'header-frame', bounds: { top: 5, left: 20, bottom: 15, right: 80 } },
        { story: 'body', location: 'body-frame', bounds: { top: 20, left: 10, bottom: 90, right: 90 } },
      ],
    },
  ]
  const report = new ReportCollector()
  const book = modelToBook(model(pages, [header, body]), report)

  expect(book.body.map((chapter) => chapter.title)).toEqual(['body'])
  expect(book.rectoOpenings).toBe(true)
  expect(report.data().versoOpenings).toEqual({})
})

test('keeps recto openings off and reports no ordinal verso in a single-sided document', () => {
  const report = new ReportCollector()
  const book = modelToBook(
    model(
      [
        { id: 'first-page', stories: [] },
        { id: 'second-page', stories: ['chapter'] },
      ],
      [story('chapter')],
      { facingPages: false },
    ),
    report,
  )

  expect(book.rectoOpenings).toBe(false)
  expect(report.data().versoOpenings).toEqual({})
})

test('ignores a page-less chapter when located chapters open on rectos', () => {
  const report = new ReportCollector()
  const book = modelToBook(model([{ id: 'recto-page', stories: ['located'], side: 'right' }], [story('located'), story('page-less')]), report)

  expect(book.body.map((chapter) => chapter.title)).toEqual(['located', 'page-less'])
  expect(book.rectoOpenings).toBe(true)
  expect(report.data().versoOpenings).toEqual({})
})

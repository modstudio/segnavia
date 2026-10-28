import { expect, test } from 'bun:test'
import { bookDocument } from '@segnavia/html'
import { modelToBook } from './map-book.ts'
import type { IdmlModel } from './model.ts'
import { ReportCollector } from './report.ts'
import type { IdmlTextNode } from './types.ts'

const node = (name: string, children: IdmlTextNode[] = [], attributes: Record<string, string> = {}, text?: string): IdmlTextNode => ({
  name,
  children,
  attributes,
  ...(text === undefined ? {} : { text }),
  location: `Story/${name}`,
})

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
  }
  const book = modelToBook(model)
  expect(book.dir).toBe('ltr')
  expect(book.rectoOpenings).toBe(false)
  expect(book.page?.margin.inner).toBeCloseTo(30 * (25.4 / 72))
  expect(book.page?.margin.outer).toBeCloseTo(40 * (25.4 / 72))
})

test('maps RTL master heads, chapter parents, marks, unmapped items, and no-master pages', () => {
  const variable = {
    id: 'var',
    name: 'Siman',
    type: 'MatchCharacterStyleType',
    appliedCharacterStyle: 'mark',
    searchStrategy: 'LastOnPage',
    location: 'designmap#var',
  }
  const masterRoot = node('Story', [
    node('ParagraphStyleRange', [node('CharacterStyleRange', [node('TextVariableInstance', [], { AssociatedTextVariable: 'var' })])]),
  ])
  const bodyRoot = node('Story', [
    node('ParagraphStyleRange', [
      node('CharacterStyleRange', [node('Content', [], {}, 'Whole ')], { AppliedCharacterStyle: 'mark' }),
      node('CharacterStyleRange', [node('Content', [], {}, 'run')], { AppliedCharacterStyle: 'mark', PointSize: '14' }),
    ]),
  ])
  const model: IdmlModel = {
    id: 'masters',
    preferences: { pageWidth: 100, pageHeight: 100, facingPages: true, binding: 'right-to-left', margin: { top: 10, bottom: 10, left: 10, right: 10 } },
    spreads: [
      {
        id: 's',
        pages: [
          { id: 'p1', appliedMaster: 'h', stories: ['body'], side: 'left' },
          { id: 'p2', appliedMaster: 'h', stories: ['body'], side: 'right' },
          { id: 'p3', appliedMaster: 'n', stories: ['none'], side: 'left' },
        ],
      },
    ],
    masterSpreads: [
      {
        id: 'h',
        name: 'H-Haggadah',
        pages: [
          {
            id: 'hl',
            stories: ['head-left'],
            side: 'left',
            margin: { top: 10, bottom: 11, left: 12, right: 13 },
            frames: [{ id: 'fl', story: 'head-left', bounds: { left: 30, top: 2, width: 20, height: 5 } }],
          },
          {
            id: 'hr',
            stories: ['head-right'],
            side: 'right',
            margin: { top: 20, bottom: 21, left: 22, right: 23 },
            frames: [
              { id: 'fr', story: 'head-right', bounds: { left: 40, top: 3, width: 20, height: 5 } },
              { id: 'body-frame', story: 'unmapped', bounds: { left: 20, top: 30, width: 50, height: 40 } },
            ],
          },
        ],
        unmappedItems: [{ type: 'Rectangle', id: 'rect' }],
      },
    ],
    stories: [
      { id: 'body', part: 'body', root: bodyRoot },
      { id: 'none', part: 'none' },
      { id: 'head-left', part: 'left', root: masterRoot },
      { id: 'head-right', part: 'right', root: masterRoot },
      { id: 'unmapped', part: 'unmapped' },
    ],
    styles: [{ id: 'mark', name: 'Mark', kind: 'character', properties: {}, location: 'styles#mark' }],
    textVariables: [variable],
    masterStoryIds: ['head-left', 'head-right', 'unmapped'],
    partsRead: [],
  }
  const report = new ReportCollector()
  const book = modelToBook(model, report)
  expect(book.parentPages.map((parent) => parent.name)).toEqual(['idml-h-haggadah-recto', 'idml-h-haggadah-verso', 'idml-none'])
  expect(book.parentPages[0]?.margin).toMatchObject({ inner: 13 * (25.4 / 72), outer: 12 * (25.4 / 72) })
  expect(book.parentPages[0]?.head).toContain('data-motif="segnavia:mark" data-motif-name="Siman" data-motif-which="last"')
  expect(book.css).toContain('inset-inline-start:')
  expect(book.css).not.toContain('left:')
  const firstHtml = book.chapters[0] && 'html' in book.chapters[0] ? book.chapters[0].html : ''
  expect(firstHtml).toContain('<span data-mark="Siman"><span class="idml-c-mark">Whole </span>')
  expect(firstHtml).toContain('>run</span></span>')
  expect(book.chapters[0]?.parents).toEqual({ opener: 'idml-h-haggadah-recto', verso: 'idml-h-haggadah-verso' })
  expect(book.chapters[1]?.parents).toEqual({ opener: 'idml-none' })
  expect(report.data().locations['element:master TextFrame']).toEqual(['H-Haggadah#body-frame'])
  expect(report.data().locations['element:master Rectangle']).toEqual(['H-Haggadah#rect'])
  expect(report.data().unsupportedElements['master story']).toBe(1)
  expect(() => bookDocument(book)).not.toThrow()
})

test('maps a single-page LTR master folio foot to both chapter sides', () => {
  const folio = node('Story', [node('ParagraphStyleRange', [node('CharacterStyleRange', [node('#processing-instruction', [], {}, '?ACE 18?')])])])
  const model: IdmlModel = {
    id: 'ltr',
    preferences: { pageWidth: 100, pageHeight: 100, facingPages: true, binding: 'left-to-right', margin: { top: 10, bottom: 10, left: 10, right: 10 } },
    spreads: [
      {
        id: 's',
        pages: [
          { id: 'p1', appliedMaster: 'a', stories: ['body'] },
          { id: 'p2', appliedMaster: 'a', stories: ['body'] },
        ],
      },
    ],
    masterSpreads: [
      {
        id: 'a',
        name: 'A-Master',
        pages: [
          {
            id: 'a1',
            stories: ['folio'],
            side: 'single',
            margin: { top: 5, bottom: 10, left: 15, right: 20 },
            frames: [{ id: 'f', story: 'folio', bounds: { left: 40, top: 92, width: 10, height: 5 } }],
          },
        ],
        unmappedItems: [],
      },
    ],
    stories: [
      { id: 'body', part: 'body' },
      { id: 'folio', part: 'folio', root: folio },
    ],
    masterStoryIds: ['folio'],
    partsRead: [],
  }
  const book = modelToBook(model)
  expect(book.parentPages).toHaveLength(1)
  expect(book.parentPages[0]?.foot).toContain('data-motif="segnavia:folio"')
  expect(book.chapters[0]?.parents).toEqual({ opener: 'idml-a-master-recto', verso: 'idml-a-master-recto' })
})

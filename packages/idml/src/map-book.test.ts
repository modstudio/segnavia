import { expect, test } from 'bun:test'
import { bookDocument } from '@segnavia/html'
import { modelToBook, refuseActiveBookHtml } from './map-book.ts'
import { chapterParents, type MasterMapping } from './masters.ts'
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
    node('ParagraphStyleRange', [
      node('CharacterStyleRange', [node('TextVariableInstance', [], { AssociatedTextVariable: 'var' })], {
        AppliedCharacterStyle: 'mark',
        PointSize: '14',
      }),
    ]),
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
          { id: 'p3', appliedMaster: 'h', stories: ['body'], side: 'left' },
          { id: 'p4', appliedMaster: 'n', stories: ['none'], side: 'right' },
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
            stories: ['head-left', 'head-left-edge'],
            side: 'left',
            margin: { top: 10, bottom: 11, left: 12, right: 13 },
            frames: [
              { id: 'fl', story: 'head-left', bounds: { left: 30, top: 2, width: 20, height: 5 } },
              { id: 'fle', story: 'head-left-edge', bounds: { left: 55, top: 1, width: 10, height: 6 } },
            ],
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
      { id: 'head-left-edge', part: 'left-edge', root: masterRoot },
      { id: 'head-right', part: 'right', root: masterRoot },
      { id: 'unmapped', part: 'unmapped' },
    ],
    styles: [{ id: 'mark', name: 'Mark', kind: 'character', properties: {}, location: 'styles#mark' }],
    textVariables: [variable],
    masterStoryIds: ['head-left', 'head-left-edge', 'head-right', 'unmapped'],
    partsRead: [],
  }
  const report = new ReportCollector()
  const book = modelToBook(model, report)
  expect(book.parentPages.map((parent) => parent.name)).toEqual(['idml-h-haggadah-recto', 'idml-h-haggadah-verso', 'idml-none'])
  expect(book.parentPages[0]?.margin).toMatchObject({ inner: 13 * (25.4 / 72), outer: 12 * (25.4 / 72) })
  expect(book.parentPages[0]?.head).toContain('data-motif="segnavia:mark" data-motif-name="Siman" data-motif-which="last"')
  expect(book.parentPages[0]?.head).toContain('class="idml-master-frame-1"')
  expect(book.parentPages[0]?.head).toContain('class="idml-c-mark idml-o-2"')
  expect(book.css).toContain(
    ':where(.idml-master-frame-1){position:absolute;inset-inline-start:13.052778mm;inline-size:7.055556mm;inset-block-start:0.705556mm;block-size:1.763889mm}',
  )
  expect(book.css).toContain(
    ':where(.idml-master-frame-2){position:absolute;inset-inline-start:7.761111mm;inline-size:3.527778mm;inset-block-start:0.352778mm;block-size:2.116667mm}',
  )
  expect(book.css).toContain(
    ':where(.idml-master-frame-3){position:absolute;inset-inline-start:5.997222mm;inline-size:7.055556mm;inset-block-start:1.058333mm;block-size:1.763889mm}',
  )
  const firstHtml = book.chapters[0] && 'html' in book.chapters[0] ? book.chapters[0].html : ''
  expect(firstHtml).toContain('<span data-mark="Siman"><span class="idml-c-mark">Whole </span>')
  expect(firstHtml).toContain('>run</span></span>')
  expect(book.chapters[0]?.parents).toEqual({ opener: 'idml-h-haggadah-recto', recto: 'idml-h-haggadah-recto', verso: 'idml-h-haggadah-verso' })
  expect(book.chapters[1]?.parents).toEqual({ opener: 'idml-none' })
  expect(report.data().locations['element:master TextFrame']).toEqual(['H-Haggadah#body-frame'])
  expect(report.data().locations['element:master Rectangle']).toEqual(['H-Haggadah#rect'])
  expect(report.data().unsupportedElements['master story']).toBe(1)
  expect(report.data().unsupportedElements['master margins disagree']).toBe(1)
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
  expect(book.parentPages[0]?.foot).toContain('class="idml-master-frame-1"')
  expect(book.css).toContain(
    ':where(.idml-master-frame-1){position:absolute;inset-inline-start:8.819444mm;inline-size:3.527778mm;inset-block-start:0.705556mm;block-size:1.763889mm}',
  )
  expect(book.page?.margin).toEqual({ top: 5 * (25.4 / 72), bottom: 10 * (25.4 / 72), inner: 15 * (25.4 / 72), outer: 20 * (25.4 / 72) })
  expect(book.chapters[0]?.parents).toEqual({ opener: 'idml-a-master-recto', verso: 'idml-a-master-recto' })
})

test('emits an unapplied base master and preserves its inheritance', () => {
  const model: IdmlModel = {
    id: 'base',
    preferences: { pageWidth: 100, pageHeight: 100, facingPages: true, binding: 'left-to-right', margin: { top: 10, bottom: 10, left: 10, right: 10 } },
    spreads: [{ id: 's', pages: [{ id: 'p', appliedMaster: 'child', stories: ['body'], side: 'right' }] }],
    masterSpreads: [
      {
        id: 'base',
        name: 'A-Base',
        pages: [{ id: 'base-page', stories: [], side: 'single', margin: { top: 10, bottom: 10, left: 10, right: 10 }, frames: [] }],
        unmappedItems: [],
      },
      {
        id: 'child',
        name: 'B-Child',
        basedOn: 'base',
        pages: [{ id: 'child-page', stories: [], side: 'single', margin: { top: 10, bottom: 10, left: 10, right: 10 }, frames: [] }],
        unmappedItems: [],
      },
    ],
    stories: [{ id: 'body', part: 'body' }],
    masterStoryIds: [],
    partsRead: [],
  }
  const book = modelToBook(model)
  expect(book.parentPages.map((parent) => parent.name)).toEqual(['idml-a-base-recto', 'idml-b-child-recto'])
  expect(book.parentPages[1]?.basedOn).toBe('idml-a-base-recto')
})

test('reports extra master pages and unknown applied masters by location', () => {
  const report = new ReportCollector()
  const model: IdmlModel = {
    id: 'extra',
    preferences: { pageWidth: 100, pageHeight: 100, facingPages: true, binding: 'left-to-right', margin: { top: 10, bottom: 10, left: 10, right: 10 } },
    spreads: [{ id: 's', pages: [{ id: 'body-page', appliedMaster: 'missing', stories: ['body'], side: 'right' }] }],
    masterSpreads: [
      {
        id: 'three',
        name: 'Three',
        pages: [
          { id: 'left', stories: [], side: 'left', margin: { top: 10, bottom: 10, left: 10, right: 10 }, frames: [] },
          {
            id: 'middle',
            stories: ['middle-story'],
            side: 'single',
            margin: { top: 10, bottom: 10, left: 10, right: 10 },
            frames: [{ id: 'middle-frame', story: 'middle-story', bounds: { left: 20, top: 20, width: 20, height: 20 } }],
          },
          { id: 'right', stories: [], side: 'right', margin: { top: 10, bottom: 10, left: 10, right: 10 }, frames: [] },
        ],
        unmappedItems: [],
      },
    ],
    stories: [
      { id: 'body', part: 'body' },
      { id: 'middle-story', part: 'middle' },
    ],
    masterStoryIds: ['middle-story'],
    partsRead: [],
  }
  const book = modelToBook(model, report)
  expect(book.chapters[0]?.parents).toEqual({ opener: 'segnavia:recto' })
  expect(report.data().locations['element:applied master unknown:missing']).toEqual(['body-page'])

  const target = model.spreads[0]?.pages[0]
  if (!target) throw new Error('Expected the synthetic body page.')
  target.appliedMaster = 'three'
  modelToBook(model, report)
  expect(report.data().locations['element:master page']).toEqual(['Three#middle'])
  expect(report.data().locations['element:master TextFrame']).toContain('Three#middle-frame')
})

test('refuses active content found only in a master head', () => {
  expect(() => refuseActiveBookHtml([{ html: '<p>safe</p>' }], [{ name: 'unsafe', head: '<script>unsafe</script>' }])).toThrow(
    'the imported Book contains active content',
  )
})

test('reports a mixed-master chapter as structured data and breaks ties by page order', () => {
  const model: IdmlModel = {
    id: 'mixed',
    preferences: { pageWidth: 100, pageHeight: 100, facingPages: true, binding: 'left-to-right', margin: { top: 10, bottom: 10, left: 10, right: 10 } },
    spreads: [
      {
        id: 's',
        pages: [
          { id: 'opening', appliedMaster: 'a', stories: ['body'], side: 'right' },
          { id: 'first-verso', appliedMaster: 'a', stories: ['body'], side: 'left' },
          { id: 'second-verso', appliedMaster: 'b', stories: ['body'], side: 'left' },
        ],
      },
    ],
    masterSpreads: [],
    stories: [{ id: 'body', part: 'body' }],
    masterStoryIds: [],
    partsRead: [],
  }
  const mapping: MasterMapping = {
    parents: [],
    css: '',
    mappedStories: new Set(),
    parentFor: (master, role) => `${master}-${role}`,
    marginFor: () => model.preferences.margin,
  }
  const report = new ReportCollector()
  expect(chapterParents('body', model, mapping, report)).toEqual({ opener: 'a-recto', verso: 'a-verso' })
  expect(report.data().mixedMasterChapters).toEqual([{ chapter: 'body', side: 'verso', masters: ['a', 'b'], chosen: 'a' }])
})

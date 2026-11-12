import { describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { Board } from './board.ts'
import { Book, bookSectionOpensFacts } from './book.ts'
import { identifiedBookInput } from './book-test-helper.ts'
import { Deck } from './deck.ts'
import { Document } from './document.ts'
import { documentBookDivisions } from './document-book-items.ts'
import { boardFromDocument, bookFromDocument, deckFromDocument, documentFromBoard, pageFromDocument, printedFromDocument } from './document-lowering.ts'
import { Page } from './page.ts'

const hebrewPageFixture = {
  html: '<h1 style="font-family:sans-serif">שלום</h1><p>A page set right to left.</p>',
  size: { width: 600, height: 'auto' as const },
  dir: 'rtl' as const,
  lang: 'he',
}

const printedPagesFixture = {
  html: '<style>body{font:14px sans-serif}</style><p>עברית-1 flowing body</p><p class="forced">עברית-2 flowing body</p>',
  lang: 'he',
  dir: 'rtl' as const,
  print: { paper: 'letter' as const },
  printedPages: {
    parents: [
      {
        name: 'body',
        margin: { blockStart: 18, blockEnd: 18, inlineStart: 22, inlineEnd: 12 },
        regions: { foot: { edge: 'blockEnd', html: '<footer data-motif="printed-foot"></footer>' } },
      },
      {
        name: 'first',
        basedOn: 'body',
        margin: { blockStart: 30, blockEnd: 18, inlineStart: 22, inlineEnd: 12 },
        regions: { head: { edge: 'blockStart', html: '<header data-motif="printed-head"></header>' } },
      },
    ],
    parentRules: [{ when: { position: 'documentFirst' }, parent: 'first' }, { parent: 'body' }],
  },
}

const hebrewBookFixture = {
  title: 'ספר ההפלגה',
  mode: 'paginated' as const,
  page: { paper: 'a5' as const, margin: { blockStart: 16, blockEnd: 16, inlineStart: 18, inlineEnd: 12 } },
  dir: 'rtl' as const,
  lang: 'he',
  css: ':where(html){font:16px/1.7 serif}',
  numbering: { frontMatter: 'arabic' as const, body: 'hebrew' as const, printed: { frontMatter: true, body: true } },
  parentPages: [
    {
      name: 'sefer',
      margin: { blockStart: 16, blockEnd: 16, inlineStart: 18, inlineEnd: 12 },
      regions: { head: { edge: 'blockStart', html: '<header>ספר ההפלגה</header>' } },
    },
  ],
  notes: [{ name: 'commentary', placement: 'book' as const, numbering: 'book' as const, marker: 'arabic' as const, title: 'פירוש' }],
  contents: { pageNumbers: true, depth: 2 },
  frontMatter: [
    { title: 'שער', contents: false, html: '<h1>ספר ההפלגה</h1>' },
    { kind: 'contents' as const, title: 'תוכן' },
  ],
  chapters: [
    { title: 'התחלה', html: '<h1>התחלה</h1><p>הספינה יצאה אל הים<span data-note="footnote">הערת שוליים על ההפלגה.</span>.</p>' },
    { title: 'החוף הרחוק', html: '<h1 id="far-shore">החוף הרחוק</h1><p>בקצה המסע נמצא חוף חדש.</p>' },
  ],
}

function continueRefusalAt(children: unknown[], index: number, field: string, divided: boolean): boolean {
  const documentChildren = divided ? [{ type: 'division', name: 'body', children }] : children
  try {
    Document.parse({ type: 'document', kind: 'book', title: 'Book', mode: 'continuous', children: documentChildren })
    throw new Error('the continue policy should refuse this document')
  } catch (error) {
    if (!(error instanceof ZodError)) throw error
    const prefix = divided ? ['children', 0, 'children'] : ['children']
    return error.issues.some((issue) => issue.path.join('.') === [...prefix, index, field].join('.'))
  }
}

describe('Document lowering', () => {
  test('keeps continue when lowering a flowing book section', () => {
    const document = Document.parse({
      type: 'document',
      kind: 'book',
      title: 'Book',
      mode: 'continuous',
      children: [
        { type: 'section', id: 'one', title: 'One', children: [{ type: 'flow', html: '<p>One</p>' }] },
        { type: 'section', id: 'two', title: 'Two', opens: 'continue', children: [{ type: 'flow', html: '<p>Two</p>' }] },
      ],
    })
    expect(bookFromDocument(document).body[1]).toMatchObject({ id: 'two', opens: 'continue' })
    expect(bookSectionOpensFacts(documentBookDivisions(document))).toEqual(bookSectionOpensFacts(bookFromDocument(document)))
  })

  test('projects parts and multiple flow children through the same book opens facts', () => {
    const document = {
      children: [
        {
          type: 'part',
          id: 'part',
          name: 'part',
          title: 'Part',
          contents: true,
          children: [{ type: 'section', id: 'inside', title: 'Inside', children: [{ type: 'flow', html: '<p>Inside</p>' }] }],
        },
        {
          type: 'section',
          id: 'many',
          title: 'Many',
          children: [
            { type: 'flow', html: '<p>First</p>' },
            { type: 'flow', html: '<p>Second</p>' },
          ],
        },
        { type: 'section', id: 'after', title: 'After', opens: 'continue', children: [{ type: 'flow', html: '<p>After</p>' }] },
      ],
    } as Parameters<typeof documentBookDivisions>[0]
    const divisions = documentBookDivisions(document)
    const book = Book.parse({ title: 'Book', mode: 'continuous', ...divisions })
    expect(bookSectionOpensFacts(divisions)).toEqual(bookSectionOpensFacts(book))
    expect(bookSectionOpensFacts(book).map(({ id, flowing, sequence }) => ({ id, flowing, sequence }))).toEqual([
      { id: 'part', flowing: false, sequence: 'body' },
      { id: 'inside', flowing: true, sequence: 'body.0.children' },
      { id: 'many', flowing: true, sequence: 'body' },
      { id: 'after', flowing: true, sequence: 'body' },
    ])
  })

  test('reports every continue refusal at its source node with and without divisions', () => {
    const flow = (id: string, fields: Record<string, unknown> = {}) => ({
      type: 'section' as const,
      id,
      title: id,
      ...fields,
      children: [{ type: 'flow' as const, html: `<p>${id}</p>` }],
    })
    const cases = [
      { children: [flow('first', { opens: 'continue' })], index: 0, field: 'opens' },
      {
        children: [
          { type: 'section' as const, id: 'fixed', title: 'fixed', children: [{ type: 'page' as const, body: { html: '<p>fixed</p>' } }] },
          flow('after-fixed', { opens: 'continue' }),
        ],
        index: 1,
        field: 'opens',
      },
      { children: [flow('one'), flow('numbered', { opens: 'continue', numbering: { counted: false } })], index: 1, field: 'numbering' },
      { children: [flow('one'), flow('dressed', { opens: 'continue', parentRules: [{ parent: 'chapter' }] })], index: 1, field: 'parentRules' },
    ]
    const paths: boolean[] = []
    for (const divided of [false, true]) {
      for (const held of cases) {
        paths.push(continueRefusalAt(held.children, held.index, held.field, divided))
      }
    }
    expect(paths).toEqual(Array(8).fill(true))
  })

  test('carries section contents text into a book entry', () => {
    const document = Document.parse({
      type: 'document',
      kind: 'book',
      title: 'Book',
      mode: 'continuous',
      children: [
        {
          type: 'section',
          id: 'chapter',
          title: 'Chapter',
          contentsLabel: 'Short label',
          subtitle: 'A subtitle',
          children: [{ type: 'flow', html: '<p>Text</p>' }],
        },
      ],
    })
    expect(bookFromDocument(document).body).toEqual([
      { id: 'chapter', title: 'Chapter', contentsLabel: 'Short label', subtitle: 'A subtitle', html: '<p>Text</p>' },
    ])
  })

  test('refuses empty section contents text with the remedy', () => {
    for (const field of ['contentsLabel', 'subtitle'] as const) {
      expect(() =>
        Document.parse({
          type: 'document',
          kind: 'book',
          title: 'Book',
          mode: 'continuous',
          children: [{ type: 'section', title: 'Chapter', [field]: '', children: [{ type: 'flow', html: '<p>Text</p>' }] }],
        }),
      ).toThrow(`${field} cannot be empty; omit ${field} or give it text to clear this refusal`)
    }
  })

  test('carries a resolved brand without replacing the document brand name', () => {
    const document = Document.parse({
      type: 'document',
      kind: 'page',
      brand: 'house',
      children: [{ type: 'page', body: { html: '<p>Body</p>' } }],
    })
    const brand = { tokens: { colors: { ink: '#112233' } } }
    expect(pageFromDocument(document, brand).brand).toEqual(brand)
    expect(document.brand).toBe('house')
  })

  test('lowers the demo deck to its current parsed value', () => {
    const expected = Deck.parse({
      title: 'PDF backgrounds refuse',
      scripts: 'refuse',
      slides: [
        {
          id: 'root-background',
          content: { kind: 'html', html: '<style>html{background:rgb(60,60,60)}</style><h1>Root background</h1>' },
          notes: 'Root background notes.',
        },
        { id: 'image', content: { kind: 'image', src: 'fixture.png', alt: 'The captured class list' }, notes: 'Image slide notes.' },
      ],
    })
    const document = Document.parse({
      type: 'document',
      kind: 'deck',
      title: expected.title,
      settings: { scripts: expected.scripts },
      children: expected.slides.map(({ id, ...slide }) => ({ type: 'slide' as const, id, ...slide })),
    })
    expect(deckFromDocument(document)).toEqual(expected)
  })

  test('lowers the Hebrew demo page to its current parsed value', () => {
    const expected = Page.parse(hebrewPageFixture)
    const document = Document.parse(
      {
        type: 'document',
        kind: 'page',
        settings: { scripts: expected.scripts, dir: expected.dir, lang: expected.lang },
        size: expected.size,
        children: [{ type: 'page', body: expected.body }],
      },
      {
        newId: (() => {
          let id = 0
          return () => `page-${++id}`
        })(),
      },
    )
    expect(pageFromDocument(document)).toEqual({ ...expected, id: 'page-2' })
  })

  test('lowers the printed-parent demo page to its current parsed value', () => {
    const expected = Page.parse(printedPagesFixture)
    if (!expected.printedPages) throw new Error('the printed page fixture needs printedPages')
    const document = Document.parse(
      {
        type: 'document',
        kind: 'printed',
        settings: { scripts: expected.scripts, dir: expected.dir, lang: expected.lang },
        size: expected.size,
        print: expected.print,
        parentRules: expected.printedPages.parentRules,
        numbering: expected.printedPages.numbering,
        fragmentation: expected.printedPages.fragmentation,
        parentPages: expected.printedPages.parents.map(({ margin, ...parent }) => ({ type: 'parentPage' as const, ...parent, geometry: { margin } })),
        children: [{ type: 'page', body: expected.body }],
      },
      {
        newId: (() => {
          let id = 0
          return () => `printed-${++id}`
        })(),
      },
    )
    expect(printedFromDocument(document)).toEqual({ ...expected, id: 'printed-2', printedPages: { ...expected.printedPages, numbering: undefined } })
  })

  test('lowers the Hebrew sefer demo shape to its current parsed value', () => {
    const expected = Book.parse(identifiedBookInput(hebrewBookFixture))
    const front = expected.frontMatter
    const chapters = expected.body
    const frontFlow = front[0]
    if (!frontFlow || !('html' in frontFlow)) throw new Error('the Hebrew sefer fixture needs flowing front matter')
    const document = Document.parse({
      type: 'document',
      kind: 'book',
      metadata: { title: expected.title },
      mode: expected.mode,
      limits: { pages: 120 },
      page: expected.page,
      numbering: expected.numbering,
      settings: { scripts: expected.scripts, dir: expected.dir, lang: expected.lang },
      style: expected.style,
      parentPages: expected.parentPages.map(({ margin, ...parent }) => ({ type: 'parentPage' as const, ...parent, geometry: { margin } })),
      noteSeries: expected.notes.map(({ name, placement, numbering, marker, title }) => ({
        type: 'noteSeries' as const,
        name,
        placement,
        numbering,
        marker,
        title,
      })),
      children: [
        {
          type: 'division',
          name: 'front',
          children: [
            { type: 'section', id: frontFlow.id, title: frontFlow.title, contents: false, children: [{ type: 'flow', html: frontFlow.html }] },
            { type: 'contents', id: front[1]?.id, title: front[1]?.title, pageNumbers: expected.contents.pageNumbers, depth: expected.contents.depth },
          ],
        },
        {
          type: 'division',
          name: 'body',
          children: chapters.map((chapter) => {
            if (!('html' in chapter)) throw new Error('the Hebrew sefer fixture needs flowing chapters')
            return { type: 'section' as const, id: chapter.id, title: chapter.title, children: [{ type: 'flow' as const, html: chapter.html }] }
          }),
        },
      ],
    })
    expect(bookFromDocument(document)).toEqual({ ...expected, limits: { pages: 120 } })
  })

  test('carries section numbering into the lowered book section', () => {
    const document = Document.parse({
      type: 'document',
      kind: 'book',
      title: 'Book',
      mode: 'paginated',
      page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 12, inlineEnd: 12 } },
      children: [
        { type: 'division', name: 'front', children: [{ type: 'contents', id: 'contents', numbering: { restart: 2 } }] },
        {
          type: 'division',
          name: 'body',
          children: [
            { type: 'section', title: 'Cover', numbering: { counted: false }, children: [{ type: 'flow', html: '<p>Cover</p>' }] },
            { type: 'section', title: 'Text', numbering: { restart: 4 }, children: [{ type: 'flow', html: '<p>Text</p>' }] },
          ],
        },
      ],
    })
    expect(bookFromDocument(document).frontMatter[0]).toMatchObject({ kind: 'contents', numbering: { restart: 2 } })
    expect(bookFromDocument(document).body.map((section) => ('numbering' in section ? section.numbering : undefined))).toEqual([
      { counted: false },
      { restart: 4 },
    ])
  })

  test('round-trips board edits through a Document with a root title', () => {
    const expected = Board.parse({
      title: 'Board demo',
      direction: 'ltr',
      items: [{ id: 'deck-small', kind: 'deck', address: 'deck', x: 0, y: 0, width: 220 }],
      labels: [{ id: 'label', text: 'Local assets', x: -160, y: -105 }],
      sections: [{ id: 'section', title: 'One deck', rectangle: { x: -24, y: -56, width: 300, height: 236 }, items: ['deck-small'] }],
    })
    const document = Document.parse({
      type: 'document',
      kind: 'board',
      title: expected.title,
      settings: { dir: expected.direction },
      children: [
        ...expected.labels.map(({ id, ...label }) => ({ type: 'label' as const, id, ...label })),
        ...expected.items.map(({ id, ...item }) => ({ type: 'item' as const, id, ...item })),
        ...expected.sections.map(({ id, ...section }) => ({ type: 'boardSection' as const, id, ...section })),
      ],
    })
    expect(boardFromDocument(document)).toEqual(expected)
    expect(documentFromBoard(boardFromDocument(document), document)).toEqual(document)
    expect(boardFromDocument(documentFromBoard(expected, document))).toEqual(expected)

    const edited = Board.parse({ ...expected, title: 'Edited board', direction: 'rtl' })
    const changed = documentFromBoard(edited, document)
    expect(changed.title).toBe('Edited board')
    expect(changed.settings?.dir).toBe('rtl')
    expect(boardFromDocument(changed)).toEqual(edited)
  })

  test('round-trips board edits through a Document with a metadata title', () => {
    const document = Document.parse({
      type: 'document',
      kind: 'board',
      metadata: { title: 'Board demo' },
      settings: { dir: 'ltr' },
      children: [{ type: 'item', id: 'page', kind: 'page', address: 'page', x: 0, y: 0, width: 220 }],
    })
    const edited = Board.parse({ ...boardFromDocument(document), title: 'Edited board', direction: 'rtl' })
    const changed = documentFromBoard(edited, document)
    expect(changed.title).toBeUndefined()
    expect(changed.metadata).toEqual({ title: 'Edited board' })
    expect(changed.settings?.dir).toBe('rtl')
    expect(boardFromDocument(changed)).toEqual(edited)
  })
})

import { describe, expect, test } from 'bun:test'
import { Board } from './board.ts'
import { Book } from './book.ts'
import { Deck } from './deck.ts'
import { Document } from './document.ts'
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
        foot: '<footer data-motif="printed-foot"></footer>',
      },
      {
        name: 'first',
        basedOn: 'body',
        margin: { blockStart: 30, blockEnd: 18, inlineStart: 22, inlineEnd: 12 },
        head: '<header data-motif="printed-head"></header>',
      },
    ],
    rules: { every: 'body', first: 'first' },
  },
}

const hebrewBookFixture = {
  title: 'ספר ההפלגה',
  mode: 'paginated' as const,
  page: { paper: 'a5' as const, margin: { blockStart: 16, blockEnd: 16, inlineStart: 18, inlineEnd: 12 } },
  dir: 'rtl' as const,
  lang: 'he',
  css: ':where(html){font:16px/1.7 serif}',
  numbering: { frontMatter: 'arabic' as const, body: 'hebrew' as const },
  parentPages: [
    {
      name: 'sefer',
      margin: { blockStart: 16, blockEnd: 16, inlineStart: 18, inlineEnd: 12 },
      head: '<header>ספר ההפלגה</header>',
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

describe('Document lowering', () => {
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
    const document = Document.parse({
      type: 'document',
      kind: 'page',
      settings: { scripts: expected.scripts, dir: expected.dir, lang: expected.lang },
      size: expected.size,
      children: [{ type: 'page', body: expected.body }],
    })
    expect(pageFromDocument(document)).toEqual(expected)
  })

  test('lowers the printed-parent demo page to its current parsed value', () => {
    const expected = Page.parse(printedPagesFixture)
    if (!expected.printedPages) throw new Error('the printed page fixture needs printedPages')
    const document = Document.parse({
      type: 'document',
      kind: 'printed',
      settings: { scripts: expected.scripts, dir: expected.dir, lang: expected.lang },
      size: expected.size,
      print: expected.print,
      rules: expected.printedPages.rules,
      numbering: expected.printedPages.numbering,
      fragmentation: expected.printedPages.fragmentation,
      parentPages: expected.printedPages.parents.map(({ margin, ...parent }) => ({ type: 'parentPage' as const, ...parent, geometry: { margin } })),
      children: [{ type: 'page', body: expected.body }],
    })
    expect(printedFromDocument(document)).toEqual(expected)
  })

  test('lowers the Hebrew sefer demo shape to its current parsed value', () => {
    const expected = Book.parse(hebrewBookFixture)
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
      style: { css: expected.css, fonts: expected.fonts },
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
            { type: 'section', title: frontFlow.title, contents: false, children: [{ type: 'flow', html: frontFlow.html }] },
            { type: 'contents', title: front[1]?.title, pageNumbers: expected.contents.pageNumbers, depth: expected.contents.depth },
          ],
        },
        {
          type: 'division',
          name: 'body',
          children: chapters.map((chapter) => {
            if (!('html' in chapter)) throw new Error('the Hebrew sefer fixture needs flowing chapters')
            return { type: 'section' as const, title: chapter.title, children: [{ type: 'flow' as const, html: chapter.html }] }
          }),
        },
      ],
    })
    expect(bookFromDocument(document)).toEqual({ ...expected, limits: { pages: 120 } })
  })

  test('lowers the board demo shape to its current parsed value', () => {
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
    expect(boardFromDocument(documentFromBoard(edited, document))).toEqual(edited)
  })
})

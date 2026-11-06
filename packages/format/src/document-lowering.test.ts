import { describe, expect, test } from 'bun:test'
import { backgroundDeck } from '../../../scripts/demo-deck-pdf-fixtures.ts'
import { hebrewPage, parentPageHebrew } from '../../../scripts/demo-page-fixtures.ts'
import { bookFixtures, HEBREW_BOOK_ID } from '../../../scripts/fidelity/book-fixtures.ts'
import { Board } from './board.ts'
import { Document } from './document.ts'
import { boardFromDocument, bookFromDocument, deckFromDocument, pageFromDocument, printedFromDocument } from './document-lowering.ts'
import { Page } from './page.ts'

describe('Document lowering', () => {
  test('lowers the demo deck to its current parsed value', () => {
    const expected = backgroundDeck('refuse', 'fixture.png')
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
    const expected = Page.parse(hebrewPage)
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
    const expected = Page.parse(parentPageHebrew)
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
      parentPages: expected.printedPages.parents.map((parent) => ({ type: 'parentPage' as const, ...parent })),
      children: [{ type: 'page', body: expected.body }],
    })
    expect(printedFromDocument(document)).toEqual(expected)
  })

  test('lowers the Hebrew fidelity book to its current parsed value', async () => {
    const expected = (await bookFixtures()).find((fixture) => fixture.id === HEBREW_BOOK_ID)?.book
    if (!expected) throw new Error('the Hebrew book fixture is missing')
    const chapter = expected.body[0]
    if (!chapter || !('html' in chapter)) throw new Error('the Hebrew book fixture needs a flowing chapter')
    const document = Document.parse({
      type: 'document',
      kind: 'book',
      metadata: { title: expected.title },
      mode: expected.mode,
      page: expected.page,
      settings: { scripts: expected.scripts, dir: expected.dir, lang: expected.lang },
      children: [
        {
          type: 'division',
          name: 'body',
          children: [{ type: 'section', title: chapter.title, children: [{ type: 'flow', html: chapter.html }] }],
        },
      ],
    })
    expect(bookFromDocument(document)).toEqual(expected)
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
      direction: expected.direction,
      children: [
        ...expected.items.map(({ id, ...item }) => ({ type: 'item' as const, id, ...item })),
        ...expected.labels.map(({ id, ...label }) => ({ type: 'label' as const, id, ...label })),
        ...expected.sections.map(({ id, ...section }) => ({ type: 'boardSection' as const, id, ...section })),
      ],
    })
    expect(boardFromDocument(document)).toEqual(expected)
  })
})

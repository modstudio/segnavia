import { expect, test } from 'bun:test'
import { Imposition, Page } from '@segnavia/format'
import { printablePageValuesDocument } from './print-document.ts'

test('imposition refuses sectioned printed pages with section-aware alternatives', () => {
  const sectioned = Page.parse({
    print: { paper: 'letter' },
    printedPages: {
      parents: [{ name: 'body', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } }],
      rules: { every: 'body' },
      sections: [{ id: 'body', html: '<p>Body</p>' }],
    },
  })
  const imposition = Imposition.parse({
    paper: 'letter',
    columns: 1,
    rows: 1,
    cell: { width: 100, height: 100 },
  })
  expect(() => printablePageValuesDocument([sectioned], imposition)).toThrow('show it with <segnavia-page> or print it with pagePdf to clear this refusal')
})

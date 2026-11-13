import { expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
import { prepareSlots, resolvePrintedPageHtml } from '@segnavia/html'
import { renderPagesPdf } from './pages-pdf.ts'

test('pagesPdf refuses identity imposition across differing printed section papers by the first pair', async () => {
  const page = resolvePrintedPageHtml(
    Page.parse({
      print: { paper: 'letter' },
      style: {
        pageGeometries: {
          wide: {
            paper: 'letter',
            orientation: 'landscape',
            margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 },
          },
        },
      },
      printedPages: {
        parents: [{ name: 'body' }],
        parentRules: [{ parent: 'body' }],
        sections: [
          { id: 'one', pages: [{ html: '<p>One</p>' }] },
          { id: 'two', pageGeometry: 'wide', pages: [{ html: '<p>Two</p>' }] },
        ],
      },
    }),
  )
  const render = renderPagesPdf(
    [page],
    await prepareSlots(undefined),
    { imposition: { paper: 'letter', columns: 1, rows: 1, cell: { width: 215.9, height: 279.4 } } },
    {
      pagePdf: async () => ({ bytes: new Uint8Array() }),
      piecePdf: async () => ({ bytes: new Uint8Array() }),
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  await expect(render).rejects.toThrow('page 1 geometry 215.9mm by 279.4mm and page 2 geometry 279.4mm by 215.9mm')
})

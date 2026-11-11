import { expect, test } from 'bun:test'
import { parseBookFixture } from '@segnavia/html'
import { PDFDocument, PDFName } from 'pdf-lib'
import { renderBrowserBookPdf } from './book-render.ts'

test('places FontSource CSS before book CSS in the printed document', async () => {
  let srcdoc = ''
  await renderBrowserBookPdf(
    parseBookFixture({
      title: 'Book',
      mode: 'paginated',
      style: { css: '.book-rule{color:purple}' },
      page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
      chapters: [{ id: 'body-section', title: 'One', html: '<p class="book-rule">Text</p>' }],
    }),
    {},
    '.font-source-marker{font-family:Held}',
    {
      render: async (setup) => {
        srcdoc = setup.html
        const document = await PDFDocument.create()
        const page = document.addPage([419.53, 595.28])
        document.catalog.set(PDFName.of('Dests'), document.context.obj({ 'body-section': [page.ref, PDFName.of('XYZ'), 0, 595.28, null] }))
        return {
          bytes: await document.save(),
          overflow: { part: 'body', pageWidth: 419, extent: 419, clippedStart: 0, clippedEnd: 0, scale: 1, elements: [] },
        }
      },
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
    { date: '2026-11-14', zone: 'UTC', kind: 'current' },
  )
  expect(srcdoc.indexOf('.font-source-marker')).toBeLessThan(srcdoc.indexOf('.book-rule{color:purple}'))
})

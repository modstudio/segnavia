import { expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
import { resolvePrintedPageHtml } from '@segnavia/html'
import { printedPageValueDocument } from './printed-page-document.ts'

test('configures named papers and fixed designed-page holders', () => {
  const mixed = Page.parse({
    print: { paper: 'a4' },
    style: {
      pageGeometries: {
        wide: {
          paper: 'a4',
          orientation: 'landscape',
          margin: { blockStart: 12, blockEnd: 12, inlineStart: 12, inlineEnd: 12 },
        },
      },
    },
    printedPages: {
      parents: [{ name: 'body' }],
      parentRules: [{ parent: 'body' }],
      sections: [
        { id: 'cover', kind: 'fixed', pages: [{ html: '<h2>One</h2>' }] },
        { id: 'wide', pageGeometry: 'wide', html: '<p>Wide</p>' },
      ],
    },
  })
  const html = printedPageValueDocument(resolvePrintedPageHtml(mixed), { nonce: 'held' })
  expect(html).toContain('@page segnavia-page-1{size:210mm 297mm;margin:0}@page segnavia-page-2{size:297mm 210mm;margin:0}')
  expect(html).toContain('data-segnavia-kind="fixed"')
  expect(html).toContain('data-segnavia-designed-page="1"')
  expect(html).toContain('data-page-geometry="wide"')
})

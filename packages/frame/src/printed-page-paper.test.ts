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
        { id: 'cover', pages: [{ html: '<h2>One</h2>' }] },
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

test('keeps the legacy page rule and config when one geometry is used', () => {
  const single = Page.parse({
    print: { paper: 'a4' },
    style: {
      pageGeometries: {
        unused: { paper: 'a6', orientation: 'portrait', margin: { blockStart: 80, blockEnd: 80, inlineStart: 80, inlineEnd: 80 } },
      },
    },
    printedPages: {
      parents: [{ name: 'body' }],
      parentRules: [{ parent: 'body' }],
      sections: [{ id: 'body', html: '<p>Body</p>' }],
    },
  })
  const html = printedPageValueDocument(resolvePrintedPageHtml(single), { nonce: 'held' })
  expect(html).toContain('@page{size:210mm 297mm;margin:0}')
  expect(html).not.toContain('@page segnavia-page-')
  expect(html).not.toContain('size:105mm 148mm')
  expect(html).not.toContain('"pageName"')
  expect(html).not.toContain('"columnCount"')
})

test('names the parent, section, and paper when a section paper cannot fit its parent', () => {
  const tiny = Page.parse({
    print: { paper: 'a4' },
    style: {
      pageGeometries: {
        tiny: { paper: 'a6', orientation: 'portrait', margin: { blockStart: 0, blockEnd: 0, inlineStart: 0, inlineEnd: 0 } },
      },
    },
    printedPages: {
      parents: [{ name: 'body', margin: { blockStart: 80, blockEnd: 80, inlineStart: 0, inlineEnd: 0 } }],
      parentRules: [{ parent: 'body' }],
      sections: [{ id: 'tiny-section', title: 'Tiny', pageGeometry: 'tiny', html: '<p>Body</p>' }],
    },
  })
  expect(() => printedPageValueDocument(resolvePrintedPageHtml(tiny), { nonce: 'held' })).toThrow(
    'Parent page "body" could not establish a positive text height for section "Tiny" on paper 105mm by 148mm',
  )
})

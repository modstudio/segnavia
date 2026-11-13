import { expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
import { resolvePrintedPageHtml } from '@segnavia/html'
import { printedPageValueDocument } from './printed-page-document.ts'

test('gives an unnamed composed press page a bleed-sized CSS page box', () => {
  const page = Page.parse({
    html: '<p>Body</p>',
    print: { paper: 'a4', bleed: 3, marks: true },
    printedPages: {
      parents: [{ name: 'body', margin: { blockStart: 20, blockEnd: 20, inlineStart: 15, inlineEnd: 10 } }],
      parentRules: [{ parent: 'body' }],
    },
  })
  const html = printedPageValueDocument(resolvePrintedPageHtml(page), { nonce: 'held' })
  expect(html).toContain('@page segnavia-page-1{size:216mm 303mm;margin:3mm}')
})

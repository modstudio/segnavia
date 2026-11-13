import { expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
import { resolvePrintedPageHtml } from '@segnavia/html'
import { printedPageValueDocument } from './printed-page-document.ts'

const page = Page.parse({
  html: '<p>Body</p>',
  lang: 'he',
  print: { paper: 'a4' },
  printedPages: {
    parents: [{ name: 'body', margin: { blockStart: 20, blockEnd: 20, inlineStart: 15, inlineEnd: 10 } }],
    parentRules: [{ parent: 'body' }],
  },
})

test('defaults printed line numbers to body numbering and keeps an explicit override', () => {
  const inherited = Page.parse({ ...page, printedPages: { ...page.printedPages, lineNumbers: {} } })
  const overridden = Page.parse({ ...page, printedPages: { ...page.printedPages, lineNumbers: { system: 'arabic' } } })
  expect(printedPageValueDocument(resolvePrintedPageHtml(inherited), { nonce: 'held' })).toContain(
    '"lineNumbers":{"interval":5,"start":1,"restart":"section","area":"text","side":"outer","system":"hebrew"}',
  )
  expect(printedPageValueDocument(resolvePrintedPageHtml(overridden), { nonce: 'held' })).toContain('"system":"arabic"')
})

import { expect, test } from 'bun:test'
import { parseBookFixture } from '@segnavia/html'
import { bookValueDocument } from './book-document.ts'

test('carries saved plans and breaks in config without closing the composer script', () => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } },
    chapters: [{ id: 'chapter-a', title: 'One', html: '<p>Text</p>' }],
  })
  const plan = {
    version: 6 as const,
    fingerprint: '</script><script>unsafe()</script>',
    breaks: ['middle'],
    pages: [],
    folios: [],
    folioPrints: [],
    total: '0',
    documentFolios: [],
    documentTotal: '0',
    recordTotals: {},
    records: {},
  }
  const html = bookValueDocument(book, { nonce: 'held', plan, breaks: ['middle'] })
  expect(html).toContain('"breaks":["middle"]')
  expect(html).toContain('"plan":{"version":6')
  expect(html).not.toContain('</script><script>unsafe()</script>')
  expect(html).toContain('\\u003c/script>\\u003cscript>unsafe()\\u003c/script>')
})

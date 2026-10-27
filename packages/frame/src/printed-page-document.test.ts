import { describe, expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
import { expandFramePage } from './motif-expansion.ts'
import { PrintedPagesRefusedError, printedPageDocument } from './printed-page-document.ts'

const page = Page.parse({
  html: '<p id="start">Body</p>',
  lang: 'he',
  dir: 'rtl',
  print: { paper: 'a4' },
  printedPages: {
    parents: [
      { name: 'body', margin: { top: 20, bottom: 20, inner: 15, outer: 10 }, foot: '<b data-slot-value="printedPage.number"></b>' },
      { name: 'first', basedOn: 'body', margin: { top: 30, bottom: 20, inner: 15, outer: 10 }, head: '<h1>שלום</h1>' },
    ],
    rules: { every: 'body', first: 'first' },
  },
})

describe('printedPageDocument', () => {
  test('places the composer under the bridge nonce with inherited furniture and Hebrew numbering', () => {
    const html = printedPageDocument(page, { nonce: 'held' })
    expect(html.match(/nonce="held"/g)?.length).toBe(2)
    expect(html).toContain('data-segnavia-flow')
    expect(html).toContain('"numbering":"hebrew"')
    expect(html).toContain('data-slot-value=\\"printedPage.number\\"')
    expect(html).toContain("style.breakBefore='column'")
    expect(html).toContain("config.direction==='rtl'?b-a:a-b")
  })

  test('refuses geometry that cannot share one multicol measurement', () => {
    const changed = Page.parse({
      ...page,
      printedPages: {
        ...page.printedPages,
        parents: [...(page.printedPages?.parents ?? []), { name: 'last', basedOn: 'body', margin: { top: 20, bottom: 25, inner: 15, outer: 10 } }],
        rules: { ...page.printedPages?.rules, every: 'body', last: 'last' },
      },
    })
    expect(() => printedPageDocument(changed, { nonce: 'held' })).toThrow(PrintedPagesRefusedError)
    expect(() => printedPageDocument(changed, { nonce: 'held' })).toThrow('make their top plus bottom margins equal')
  })

  test('refuses host data that collides with the composer page context', async () => {
    const placed = Page.parse({
      ...page,
      printedPages: {
        ...page.printedPages,
        parents: [{ ...(page.printedPages?.parents[0] as object), name: 'body', foot: '<footer data-motif="folio"></footer>' }],
        rules: { every: 'body' },
      },
    })
    const source = {
      motif: async () => ({
        key: 'folio',
        revision: 'one',
        label: 'Folio',
        fields: [],
        fonts: [],
        versions: [{ lang: 'he', html: '<span data-slot-value="printedPage.number"></span>' }],
      }),
      data: async () => ({ printedPage: { number: 'host' } }),
    }
    await expect(expandFramePage(placed, { source }, new AbortController().signal)).rejects.toThrow('remove printedPage from MotifSource.data')
  })
})

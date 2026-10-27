import { describe, expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
import { printedPageAt } from '@segnavia/html'
import { expandFramePage } from './motif-expansion.ts'
import { PRINTED_PAGE_COMPOSER_SCRIPT, PrintedPagesRefusedError, printedPageDocument } from './printed-page-document.ts'

const page = Page.parse({
  html: '<p id="start">Body</p>',
  lang: 'he',
  dir: 'rtl',
  print: { paper: 'a4' },
  printedPages: {
    parents: [
      {
        name: 'body',
        margin: { top: 20, bottom: 20, inner: 15, outer: 10 },
        head: '<i>Inherited</i>',
        foot: '<b data-slot-value="printedPage.number"></b>',
      },
      { name: 'first', basedOn: 'body', margin: { top: 30, bottom: 20, inner: 15, outer: 10 } },
    ],
    rules: { every: 'body', first: 'first' },
  },
})

const changedPage = (parent: object, rules: object) =>
  Page.parse({
    ...page,
    printedPages: {
      ...page.printedPages,
      parents: [...(page.printedPages?.parents ?? []), parent],
      rules: { ...page.printedPages?.rules, every: 'body', ...rules },
    },
  })

describe('printedPageDocument', () => {
  test('carries resolved config under the bridge nonce and injects the shared policy', () => {
    const html = printedPageDocument(page, { nonce: 'held' })
    expect(html.match(/<script nonce="held">/g)?.length).toBeGreaterThanOrEqual(1)
    expect(html).toContain('"numbering":"hebrew"')
    expect(html).toContain('data-slot-value=\\"printedPage.number\\"')
    expect(html.match(/\\u003ci>Inherited\\u003c\/i>/g)?.length).toBe(2)
    expect(PRINTED_PAGE_COMPOSER_SCRIPT).toContain(printedPageAt.toString())
  })

  test('keeps whole-document head resources beside a flow holding only body children', () => {
    const full = Page.parse({ ...page, html: '<!doctype html><html><head><meta name="x"><style>.x{color:red}</style></head><body><p>Whole</p></body></html>' })
    const html = printedPageDocument(full, { nonce: 'held' })
    expect(html).toContain('<meta name="x"><style>.x{color:red}</style><div data-segnavia-flow><p>Whole</p></div>')
    expect(html).not.toContain('<div data-segnavia-flow><!doctype html>')
  })

  test('starts at zero height and can build one numbered paper after measuring the full flow', () => {
    const measuring = printedPageDocument(page, { nonce: 'held', measure: true })
    const second = printedPageDocument(page, { nonce: 'held', only: 2 })
    expect(measuring).toContain(':where([data-segnavia-flow]){position:absolute}')
    expect(measuring).toContain('html:not([data-segnavia-composed])')
    expect(measuring).toContain('ResizeObserver')
    expect(second).toContain('"only":2')
    expect(second).not.toContain('ResizeObserver')
    expect(second).toContain('attributeFilter:[name]')
  })

  test('settles furniture resources and fonts before marking composition complete', () => {
    const html = printedPageDocument(page, { nonce: 'held' })
    expect(html).toContain('readyImages(pages)')
    expect(html).toContain('document.fonts?document.fonts.ready:Promise.resolve(),readyImages(pages)')
    expect(html).not.toContain('setTimeout(resolve,50)')
  })

  test('carries root backgrounds only for a printable composed paper', () => {
    const measuring = printedPageDocument(page, { nonce: 'held', measure: true })
    const printable = printedPageDocument(page, { nonce: 'held', only: 1, printBackground: true })
    expect(measuring).not.toContain('data-segnavia-print-background')
    expect(printable).toContain('data-segnavia-print-background')
  })

  test.each([
    [
      'width including first',
      { name: 'wide', basedOn: 'body', margin: { top: 30, bottom: 20, inner: 20, outer: 10 } },
      { first: 'wide' },
      'inner plus outer margins equal',
    ],
    [
      'height when the first parent is reused',
      { name: 'reused', basedOn: 'body', margin: { top: 30, bottom: 20, inner: 15, outer: 10 } },
      { first: 'reused', recto: 'reused' },
      'top plus bottom margins equal',
    ],
    [
      'a taller first page',
      { name: 'tall', basedOn: 'body', margin: { top: 10, bottom: 20, inner: 15, outer: 10 } },
      { first: 'tall' },
      'increase its top plus bottom margins',
    ],
    [
      'a non-positive width',
      { name: 'narrow', basedOn: 'body', margin: { top: 20, bottom: 20, inner: 110, outer: 100 } },
      { recto: 'narrow' },
      'positive text width',
    ],
    [
      'a non-positive height',
      { name: 'short', basedOn: 'body', margin: { top: 150, bottom: 147, inner: 15, outer: 10 } },
      { recto: 'short' },
      'positive text height',
    ],
    [
      'last width',
      { name: 'last-wide', basedOn: 'body', margin: { top: 20, bottom: 20, inner: 20, outer: 10 } },
      { last: 'last-wide' },
      'inner plus outer margins equal',
    ],
    [
      'last independent geometry',
      { name: 'last-shifted', basedOn: 'body', margin: { top: 25, bottom: 15, inner: 10, outer: 15 } },
      { last: 'last-shifted' },
      'geometry independent of which page is last',
    ],
  ])('refuses %s with its remedy', (_label, parent, rules, remedy) => {
    const changed = changedPage(parent, rules)
    expect(() => printedPageDocument(changed, { nonce: 'held' })).toThrow(PrintedPagesRefusedError)
    expect(() => printedPageDocument(changed, { nonce: 'held' })).toThrow(remedy)
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

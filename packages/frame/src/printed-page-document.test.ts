import { describe, expect, test } from 'bun:test'
import { computeFolios, type DocumentInput, Page, type Page as PageValue } from '@segnavia/format'
import { fragmentationCss, markdownHtml, resolvePageHtml } from '@segnavia/html'
import { layoutScript } from '@segnavia/layout'
import { MESSAGE } from './bridge.ts'
import { decideLayoutSettle, LAYOUT_SETTLE_MS } from './layout-settle.ts'
import { expandFramePage } from './motif-expansion.ts'
import {
  printedPageDocument as documentHtml,
  PRINTED_PAGE_COMPOSER_SCRIPT,
  PRINTED_PAGE_FAILURE_ATTRIBUTE,
  PrintedPagesRefusedError,
} from './printed-page-document.ts'

const page = Page.parse({
  html: '<p id="start">Body</p>',
  lang: 'he',
  dir: 'rtl',
  print: { paper: 'a4' },
  printedPages: {
    parents: [
      {
        name: 'body',
        margin: { blockStart: 20, blockEnd: 20, inlineStart: 15, inlineEnd: 10 },
        head: '<i>Inherited</i>',
        foot: '<b data-slot-value="printedPage.number"></b>',
      },
      { name: 'first', basedOn: 'body', margin: { blockStart: 30, blockEnd: 20, inlineStart: 15, inlineEnd: 10 } },
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

function printedDocument(page: PageValue): DocumentInput {
  const printed = page.printedPages
  if (!printed) throw new Error('the test page needs printedPages')
  return {
    type: 'document',
    kind: 'printed',
    settings: { scripts: page.scripts, dir: page.dir, lang: page.lang },
    print: page.print,
    limits: page.limits,
    rules: printed.rules,
    numbering: printed.numbering,
    fragmentation: printed.fragmentation,
    parentPages: printed.parents.map(({ margin, ...parent }) => ({ type: 'parentPage', ...parent, geometry: { margin } })),
    children: [{ type: 'page', id: page.id, body: page.body }],
  }
}

const printedPageDocument = (page: PageValue, options: Parameters<typeof documentHtml>[1]) => {
  let id = 0
  return documentHtml(printedDocument(page), { ...options, newId: () => `test-${++id}` })
}

describe('printedPageDocument', () => {
  test('adds safe fragmentation before host CSS and omits it when disabled', () => {
    const hostCss = ':where(tr){break-inside:auto}'
    const safe = printedPageDocument(page, { nonce: 'held', css: hostCss })
    const none = printedPageDocument(Page.parse({ ...page, printedPages: { ...page.printedPages, fragmentation: 'none' } }), { nonce: 'held', css: hostCss })

    expect(safe).toContain(fragmentationCss('safe'))
    expect(safe.indexOf(fragmentationCss('safe'))).toBeLessThan(safe.indexOf(hostCss))
    expect(none).not.toContain(fragmentationCss('safe'))
    expect(none).toContain(hostCss)
  })

  test('carries resolved config under the bridge nonce and injects the shared policy', () => {
    const html = printedPageDocument(page, { nonce: 'held' })
    expect(html.match(/<script nonce="held">/g)?.length).toBeGreaterThanOrEqual(1)
    expect(html).toContain('"numbering":"hebrew"')
    expect(html).toContain('data-slot-value=\\"printedPage.number\\"')
    expect(html.match(/\\u003ci>Inherited\\u003c\/i>/g)?.length).toBe(2)
    expect(PRINTED_PAGE_COMPOSER_SCRIPT).toContain(layoutScript())
    expect(PRINTED_PAGE_COMPOSER_SCRIPT).toContain(computeFolios.toString())
    expect(PRINTED_PAGE_COMPOSER_SCRIPT).toContain(decideLayoutSettle.toString())
    expect(PRINTED_PAGE_COMPOSER_SCRIPT).toContain(`performance.now()-startedAt,${LAYOUT_SETTLE_MS}`)
    expect(html).toContain(`var failureName="${PRINTED_PAGE_FAILURE_ATTRIBUTE}"`)
    expect(html).toContain(`type:'${MESSAGE.composeFailure}'`)
  })

  test('builds the composer config from document and host page ceilings', () => {
    const limit = (pages: number | undefined, host?: number) =>
      printedPageDocument({ ...page, limits: pages === undefined ? undefined : { pages } }, { nonce: 'held', limits: { pages: host } })
    expect(limit(600)).toContain('"limit":600')
    expect(limit(500)).toContain('"limit":500')
    expect(limit(undefined)).toContain('"limit":500')
    expect(limit(600, 300)).toContain('"limit":300')
    expect(limit(600, 300)).toContain("raise the host's limits.pages")
    expect(limit(600)).toContain('declare a higher limits.pages on the document')
  })

  test('does not read the window width while composing', () => {
    expect(PRINTED_PAGE_COMPOSER_SCRIPT).not.toContain('clientWidth')
    expect(PRINTED_PAGE_COMPOSER_SCRIPT).not.toContain('innerWidth')
    expect(PRINTED_PAGE_COMPOSER_SCRIPT).not.toContain('documentElement.clientWidth')
  })

  test('writes escaped metadata title while keeping the page language', () => {
    const metadata = printedPageDocument(page, { nonce: 'held', metadata: { title: 'הגדה <של> & "פסח"', lang: 'yi' } })
    const fallback = printedPageDocument(page, { nonce: 'held', metadata: { title: 'הגדה' } })

    expect(metadata).toContain('<title>הגדה &lt;של&gt; &amp; &quot;פסח&quot;</title>')
    expect(metadata).toContain('<html dir="rtl" lang="he">')
    expect(fallback).toContain('<html dir="rtl" lang="he">')
  })

  test('keeps whole-document head resources beside a flow holding only body children', () => {
    const full = Page.parse({
      ...page,
      body: { html: '<!doctype html><html><head><meta name="x"><style>.x{color:red}</style></head><body><p>Whole</p></body></html>' },
    })
    const html = printedPageDocument(full, { nonce: 'held' })
    expect(html).toContain('<meta name="x"><style>.x{color:red}</style><div data-segnavia-flow><p data-segnavia-id="test-5">Whole</p></div>')
    expect(html).not.toContain('<div data-segnavia-flow><!doctype html>')
  })

  test('a markdown page and its HTML equivalent have the same print geometry', () => {
    const markdown = Page.parse({ ...page, body: { markdown: '# שלום\n\nEnglish text.' } })
    const equivalent = Page.parse({
      ...page,
      body: { html: markdownHtml({ markdown: '# שלום\n\nEnglish text.' }, { dir: markdown.dir, lang: markdown.lang }) },
    })
    expect(printedPageDocument(markdown, { nonce: 'held' })).toBe(printedPageDocument(equivalent, { nonce: 'held' }))
  })

  test('starts at zero height and can build one numbered paper after measuring the full flow', () => {
    const measuring = printedPageDocument(page, { nonce: 'held', measure: true })
    const second = printedPageDocument(page, { nonce: 'held', only: 2 })
    expect(measuring).toContain(':where([data-segnavia-flow]){position:absolute}')
    expect(measuring).toContain('html:not([data-segnavia-composed])')
    expect(measuring).toContain('ResizeObserver')
    expect(second).toContain('"only":2')
    expect(second).not.toContain('ResizeObserver')
    expect(second).toContain('attributeFilter:[name,failureName]')
  })

  test('settles furniture resources and fonts before marking composition complete', () => {
    const html = printedPageDocument(page, { nonce: 'held' })
    expect(html).toContain('readyImages(pages)')
    expect(html).toContain('document.fonts?document.fonts.ready:Promise.resolve(),readyImages(pages)')
    expect(html).not.toContain('setTimeout(resolve,50)')
  })

  test('counts columns after loaded layout is stable and refuses a changed measured count', () => {
    const html = printedPageDocument(page, { nonce: 'held', only: 2, expectedCount: 3 })
    expect(html).toContain("window.addEventListener('load',resolve,{once:true})")
    expect(html).toContain('var channel=new MessageChannel()')
    expect(html).toContain("decision==='wait-for-layout'")
    expect(html).toContain('setTimeout(sample,0)')
    expect(html).toContain('"expectedCount":3')
    expect(html).toContain('the composed page count changed from ')
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
      { name: 'wide', basedOn: 'body', margin: { blockStart: 30, blockEnd: 20, inlineStart: 20, inlineEnd: 10 } },
      { first: 'wide' },
      'inner plus outer margins equal',
    ],
    [
      'height when the first parent is reused',
      { name: 'reused', basedOn: 'body', margin: { blockStart: 30, blockEnd: 20, inlineStart: 15, inlineEnd: 10 } },
      { first: 'reused', recto: 'reused' },
      'top plus bottom margins equal',
    ],
    [
      'a taller first page',
      { name: 'tall', basedOn: 'body', margin: { blockStart: 10, blockEnd: 20, inlineStart: 15, inlineEnd: 10 } },
      { first: 'tall' },
      'increase its top plus bottom margins',
    ],
    [
      'a non-positive width',
      { name: 'narrow', basedOn: 'body', margin: { blockStart: 20, blockEnd: 20, inlineStart: 110, inlineEnd: 100 } },
      { recto: 'narrow' },
      'positive text width',
    ],
    [
      'a non-positive height',
      { name: 'short', basedOn: 'body', margin: { blockStart: 150, blockEnd: 147, inlineStart: 15, inlineEnd: 10 } },
      { recto: 'short' },
      'positive text height',
    ],
    [
      'last width',
      { name: 'last-wide', basedOn: 'body', margin: { blockStart: 20, blockEnd: 20, inlineStart: 20, inlineEnd: 10 } },
      { last: 'last-wide' },
      'inner plus outer margins equal',
    ],
    [
      'last independent geometry',
      { name: 'last-shifted', basedOn: 'body', margin: { blockStart: 25, blockEnd: 15, inlineStart: 10, inlineEnd: 15 } },
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
    await expect(expandFramePage(resolvePageHtml(placed), { source }, new AbortController().signal)).rejects.toThrow('remove printedPage from MotifSource.data')
  })

  test('uses the page document language for a motif in a parent region', async () => {
    const placed = Page.parse({
      ...page,
      body: { html: '<html lang="he"><body><p>Body</p></body></html>' },
      lang: undefined,
      printedPages: {
        ...page.printedPages,
        parents: [{ ...(page.printedPages?.parents[0] as object), name: 'body', head: '<header data-motif="bilingual"></header>' }],
        rules: { every: 'body' },
      },
    })
    const source = {
      motif: async () => ({
        key: 'bilingual',
        revision: 'one',
        label: 'Bilingual',
        fields: [],
        fonts: [],
        versions: [
          { lang: 'en', html: '<span>English</span>' },
          { lang: 'he', html: '<span>עברית</span>' },
        ],
      }),
    }
    const expanded = await expandFramePage(resolvePageHtml(placed), { source }, new AbortController().signal)
    expect(expanded.page.printedPages?.parents[0]?.head).toContain('<span>עברית</span>')
  })

  test('refuses a reserved library motif placed in a parent page', async () => {
    const placed = Page.parse({
      ...page,
      printedPages: {
        ...page.printedPages,
        parents: [{ ...(page.printedPages?.parents[0] as object), name: 'body', foot: '<footer data-motif="segnavia:folio"></footer>' }],
        rules: { every: 'body' },
      },
    })
    const source = { motif: async () => undefined }
    await expect(expandFramePage(resolvePageHtml(placed), { source }, new AbortController().signal)).rejects.toThrow(
      '"segnavia:" is reserved for library motifs; rename the motif key to clear this refusal',
    )
  })

  test('parses an unquoted reserved parent placement without a motif source', async () => {
    const placed = Page.parse({
      ...page,
      printedPages: {
        ...page.printedPages,
        parents: [{ ...(page.printedPages?.parents[0] as object), name: 'body', foot: '<footer DATA-MOTIF=segnavia:folio></footer>' }],
        rules: { every: 'body' },
      },
    })
    await expect(expandFramePage(resolvePageHtml(placed), undefined, new AbortController().signal)).rejects.toThrow(
      '"segnavia:" is reserved for library motifs; rename the motif key to clear this refusal',
    )
  })
})

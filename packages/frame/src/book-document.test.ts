import { describe, expect, test } from 'bun:test'
import {
  BOOK_PARENT_NAMES,
  bookFromDocument,
  computeFolios,
  Document,
  PRINTED_PAGE_NUMBER_PATH,
  PRINTED_PAGE_TOTAL_PATH,
  resolveDirection,
  StyleSheet,
} from '@segnavia/format'
import { bookView, heldPageNumber, openerPageIndex, pageIndexForTarget, parseBookFixture, selectBookParent, windowPageIndex } from '@segnavia/html'
import { layoutScript } from '@segnavia/layout'
import { bookValueDocument as bookDocument, bookViewDocument, COMPOSER_SCRIPT, PaginatedBookRefusedError } from './book-document.ts'
import { pageScale, spreadSlots } from './book-presentation.ts'
import { flowViewDocument } from './book-view-document.ts'
import { MESSAGE } from './bridge.ts'
import { COMPOSE_FAILURE_ATTRIBUTE as BOOK_FAILURE_ATTRIBUTE, decideBookMeasurement, flowTextArea, pixelPhaseOffset, type unmeasuredFlows } from './composer.ts'
import type { forcedPageBreak } from './composer-measure.ts'

const book = parseBookFixture({
  title: 'Book',
  mode: 'paginated',
  lang: 'he',
  page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } },
  chapters: [{ id: 'chapter-a', title: 'א', html: '<p>טקסט<span data-note="footnote">הערה</span></p>' }],
})

describe('bookDocument', () => {
  test('carries a lowered brand into flow and paginated view sheets', () => {
    const document = Document.parse({
      type: 'document',
      kind: 'book',
      title: 'Book',
      mode: 'paginated',
      page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 15 } },
      brand: 'house',
      children: [{ type: 'section', title: 'Chapter', children: [{ type: 'flow', html: '<p>Body</p>' }] }],
    })
    const brand = StyleSheet.parse({ css: '.brand-mark{color:rgb(1,2,3)}' })
    const view = bookView(bookFromDocument(document, brand))
    expect(view.brand).toEqual(brand)
    expect(bookViewDocument(view, { nonce: 'held' })).toContain('@layer segnavia.brand{.brand-mark{color:rgb(1,2,3)}}')
    expect(flowViewDocument(view, { nonce: 'held' })).toContain('@layer segnavia.brand{.brand-mark{color:rgb(1,2,3)}}')
  })

  test('builds the book composer config from document and host page ceilings', () => {
    const html = bookDocument(parseBookFixture({ ...book, limits: { pages: 600 } }), { nonce: 'held' })
    expect(html).toContain('"limit":600')
    expect(html).toContain('"refusalSubject":"The book"')
    const capped = bookDocument(parseBookFixture({ ...book, limits: { pages: 600 } }), { nonce: 'held', limits: { pages: 300 } })
    expect(capped).toContain('"limit":300')
    expect(capped).toContain("raise the host's limits.pages")
  })

  test('carries declared app faces into the paginated book composer', () => {
    const html = bookDocument(parseBookFixture({ ...book, style: { fonts: { body: { faces: [{ script: 'hebrew' }] } } } }), { nonce: 'held' })
    expect(html).toContain('"fontLoads":[{"font":"body","unicodeRange":"U+0590-05FF,U+FB1D-FB4F"')
    expect(html.match(/"font":"body"/g)).toHaveLength(1)
  })

  test('carries saved plans and breaks in config without closing the composer script', () => {
    const plan = {
      version: 3 as const,
      fingerprint: '</script><script>unsafe()</script>',
      breaks: ['middle'],
      pages: [],
      folios: [],
      total: '0',
      documentFolios: [],
      documentTotal: '0',
      recordTotals: {},
      records: {},
    }
    const html = bookDocument(book, { nonce: 'held', plan, breaks: ['middle'] })
    expect(html).toContain('"breaks":["middle"]')
    expect(html).toContain('"plan":{"version":3')
    expect(html).not.toContain('</script><script>unsafe()</script>')
    expect(html).toContain('\\u003c/script>\\u003cscript>unsafe()\\u003c/script>')
  })

  test('minified embedded composer functions retain their aliases and have no module dependencies', async () => {
    const built = await Bun.build({
      entrypoints: ['virtual:composer-functions'],
      minify: true,
      target: 'browser',
      conditions: ['@segnavia/source'],
      format: 'cjs',
      plugins: [
        {
          name: 'composer-functions',
          setup(builder) {
            builder.onResolve({ filter: /^virtual:composer-functions$/ }, () => ({ path: 'composer-functions', namespace: 'virtual' }))
            builder.onLoad({ filter: /.*/, namespace: 'virtual' }, () => ({
              contents: `import { embeddedComposerFunctions } from ${JSON.stringify(`${import.meta.dir}/composer.ts`)}; export const script = embeddedComposerFunctions();`,
              loader: 'ts',
            }))
          },
        },
      ],
    })
    expect(built.success).toBe(true)
    const bundle = await built.outputs[0]?.text()
    expect(bundle).toBeDefined()
    const script = new Function('module', 'exports', `${bundle};return module.exports.script`)({ exports: {} }, {}) as string
    const embedded = new Function(`${script};return {flowTextArea,spreadSlots,pageScale,unmeasuredFlows,decideBookMeasurement,forcedPageBreak}`)() as {
      flowTextArea: typeof flowTextArea
      spreadSlots: typeof spreadSlots
      pageScale: typeof pageScale
      unmeasuredFlows: typeof unmeasuredFlows
      decideBookMeasurement: typeof decideBookMeasurement
      forcedPageBreak: typeof forcedPageBreak
    }
    expect(
      embedded.flowTextArea(
        {},
        {
          [BOOK_PARENT_NAMES.opener]: { width: 100, height: 180 },
          [BOOK_PARENT_NAMES.recto]: { width: 100, height: 160 },
          [BOOK_PARENT_NAMES.verso]: { width: 100, height: 170 },
        },
      ),
    ).toEqual({ width: 100, height: 160 })
    expect(embedded.spreadSlots(4)).toBe(spreadSlots(4))
    expect(embedded.pageScale(300, 200, 2)).toBe(pageScale(300, 200, 2))
    const flows = [{ id: 'chapter-1', sourceBlocks: 1, contentBlocks: 1, measuredLines: 0 }]
    expect(embedded.unmeasuredFlows(flows)).toEqual(['chapter-1'])
    expect(embedded.decideBookMeasurement({ hasLayout: true, flows, plannedPages: 0, visibleElapsedMs: 0 }, 1_000)).toBe('retry')
    expect(embedded.forcedPageBreak('recto')).toBe(true)
  })

  test('embeds the planner, furniture fill and parent-page planner under the bridge nonce', () => {
    const html = bookDocument(book, { nonce: 'held' })
    expect(html.match(/<script nonce="held">/g)?.length).toBeGreaterThanOrEqual(1)
    expect(html).toContain('data-segnavia-galleys')
    expect(html).toContain('data-segnavia-flow="chapter-a"')
    expect(html).toContain('data-segnavia-notes-galley')
    expect(html).toContain('"direction":"rtl"')
    expect(COMPOSER_SCRIPT).toContain(layoutScript())
    expect(COMPOSER_SCRIPT).toContain(selectBookParent.toString())
    expect(COMPOSER_SCRIPT).toContain(heldPageNumber.toString())
    expect(COMPOSER_SCRIPT).toContain(windowPageIndex.toString())
    expect(COMPOSER_SCRIPT).toContain(openerPageIndex.toString())
    expect(COMPOSER_SCRIPT).toContain(pageIndexForTarget.toString())
    expect(COMPOSER_SCRIPT).toContain(decideBookMeasurement.toString())
    expect(COMPOSER_SCRIPT).toContain('config.breaks||(config.plan&&config.plan.breaks)||[]')
    expect(COMPOSER_SCRIPT).toContain('paginateBook')
    expect(COMPOSER_SCRIPT).toContain('lineInWindow')
    expect(COMPOSER_SCRIPT).toContain(computeFolios.toString())
    expect(COMPOSER_SCRIPT).toContain('fillBookFurniture')
    expect(COMPOSER_SCRIPT).toContain('fillFurniture')
    expect(COMPOSER_SCRIPT).toContain("document.querySelectorAll('script[data-segnavia-plan]')")
    expect(COMPOSER_SCRIPT).toContain('previous[i].remove()')
    expect(COMPOSER_SCRIPT).toContain(PRINTED_PAGE_NUMBER_PATH)
    expect(COMPOSER_SCRIPT).toContain(PRINTED_PAGE_TOTAL_PATH)
    expect(COMPOSER_SCRIPT).toContain('parent.textArea')
    expect(COMPOSER_SCRIPT).toContain('sizeFlowGalley(flows[f],area.width,area.height,config.orphans,config.widows)')
    expect(COMPOSER_SCRIPT).toContain("note.style.setProperty('--segnavia-text-height',area.height+'px')")
    expect(COMPOSER_SCRIPT).toContain('data-segnavia-table-header')
    expect(COMPOSER_SCRIPT).toContain('for(var w=0;w<page.windows.length;w++)')
    expect(COMPOSER_SCRIPT).toContain('flowInlineStart')
    expect(COMPOSER_SCRIPT).toContain(resolveDirection.toString())
    expect(COMPOSER_SCRIPT).toContain(
      "fail('page references to '+moved.join(', ')+' would not settle after three additional compositions; shorten the content or reserve fixed space for page references to clear this refusal')",
    )
  })

  test('moves a placed window onto its galley source pixel phase', () => {
    const phases: Array<[number, number]> = [
      [1099.765625, 7993.25],
      [6222.125, 17557.78125],
      [-8.2, 3.7],
    ]
    for (const [source, placed] of phases) {
      const shifted = placed + pixelPhaseOffset(source, placed)
      expect(shifted - Math.floor(shifted)).toBeCloseTo(source - Math.floor(source))
    }
  })

  test('uses a flow width and its shortest text-holding parent height', () => {
    const areas = {
      tall: { width: 120, height: 200 },
      short: { width: 120, height: 150 },
      [BOOK_PARENT_NAMES.opener]: { width: 100, height: 180 },
      [BOOK_PARENT_NAMES.recto]: { width: 100, height: 160 },
      [BOOK_PARENT_NAMES.verso]: { width: 100, height: 170 },
    }

    expect(flowTextArea({ opener: 'tall', recto: 'short', verso: 'short' }, areas)).toEqual({ width: 120, height: 150 })
    expect(flowTextArea({}, areas)).toEqual({ width: 100, height: 160 })
  })

  test('refuses a continuous book and a document with issues', () => {
    const continuous = parseBookFixture({ title: 'Book', mode: 'continuous', page: book.page, chapters: book.body })
    expect(() => bookDocument(continuous, { nonce: 'held' })).toThrow(PaginatedBookRefusedError)
    expect(() => bookDocument(continuous, { nonce: 'held' })).toThrow('mode paginated and page')
    const issues = parseBookFixture({
      title: 'Book',
      mode: 'paginated',
      page: book.page,
      chapters: [{ title: 'One', html: '<p><span data-note="footnote">f</span><span data-note="endnote">e</span></p>' }],
      footnotes: { marker: 'arabic' },
      endnotes: { marker: 'arabic' },
    })
    expect(() => bookDocument(issues, { nonce: 'held' })).toThrow('footnote and endnote markers are both arabic')
  })

  test('starts at zero height until the composer marks the root', () => {
    const html = bookDocument(book, { nonce: 'held' })
    expect(html).toContain('html:not([data-segnavia-composed])')
    expect(html).toContain(JSON.stringify(BOOK_FAILURE_ATTRIBUTE))
    expect(html).toContain('book composition failed without a reported reason')
    expect(html).toContain('overflow:clip')
  })

  test('builds a screen document from a paginated view without changing the print document', () => {
    const view = {
      html: '<style>.first-build-style{color:red}</style><main data-segnavia-galleys>Held<style>.second-build-style{color:blue}</style></main>',
      flow: '<style>:where([data-segnavia-flow]){color:green}</style><section id="chapter" data-segnavia-flow="chapter">Flow</section>',
      scripts: 'refuse' as const,
      pagination: {
        paper: { width: 148, height: 210 },
        margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 },
        columnGap: 4,
        geometries: [
          {
            paper: { width: 148, height: 210 },
            margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 },
            columns: { count: 1, gap: 4 },
            parents: [],
          },
        ],
        direction: 'rtl' as const,
        numbering: { frontMatter: 'roman-lower' as const, body: 'hebrew' as const },
        rectoOpenings: false,
        orphans: 2,
        widows: 2,
        parents: [],
        endnotePlacement: 'book' as const,
        contents: { pageNumbers: true, depth: 2 },
        runningHead: { recto: 'title' as const, verso: 'title' as const },
      },
    }
    const screen = bookViewDocument(view, { nonce: 'held', screen: { spread: true } })
    const flow = flowViewDocument(view, { nonce: 'held' })
    const print = bookViewDocument(view, { nonce: 'held' })
    expect(screen).toContain('"presentation":{"spread":true,"reportPlace":true}')
    expect(screen).toContain('<style>.first-build-style{color:red}</style>')
    expect(screen).toContain('<style>.second-build-style{color:blue}</style>')
    expect(screen).not.toContain('<template data-segnavia-flow-build>')
    expect(screen).not.toContain('data-segnavia-flow-view')
    expect(screen).toContain('event.source!==parent')
    expect(screen).toContain(`data.type!=='${MESSAGE.bookLayout}'`)
    expect(screen).toContain('BOOK_LAYOUTS.indexOf(data.layout)<0')
    expect(screen).toContain('data.place!==undefined&&place===undefined')
    expect(screen).toContain(`type:'${MESSAGE.bookPlace}'`)
    expect(screen).toContain(`type:'${MESSAGE.composeFailure}'`)
    expect(screen).toContain('var settleBookPlace=function(key){scalePages();scrollTo(')
    expect(flow).toContain(view.flow)
    expect(flow).not.toContain(view.html)
    expect(flow).toContain('event.source!==parent')
    expect(flow).toContain('BOOK_LAYOUTS.indexOf(data.layout)<0')
    expect(flow).toContain('data.place!==undefined&&place===undefined')
    expect(flow).not.toContain(MESSAGE.composeFailure)
    expect(flow).toContain('var settleBookPlace=function(key){scrollTo(')
    expect(print).not.toContain('"presentation"')
    expect(print).not.toContain('<template data-segnavia-flow-build>')
    expect(print).not.toContain(MESSAGE.bookLayout)
    expect(print).not.toContain(MESSAGE.bookPlace)
    expect(print).not.toContain('BOOK_LAYOUTS.indexOf(data.layout)')
  })

  test('places sanitized book CSS between generated fonts and host CSS', () => {
    const view = {
      html: '<main data-segnavia-galleys><p class="lead">Held</p></main>',
      style: { css: '.lead{color:purple;background:url(https://example.test/ink.png)}' },
      scripts: 'refuse' as const,
      pagination: {
        paper: { width: 148, height: 210 },
        margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 },
        columnGap: 4,
        geometries: [
          {
            paper: { width: 148, height: 210 },
            margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 },
            columns: { count: 1, gap: 4 },
            parents: [],
          },
        ],
        direction: 'ltr' as const,
        numbering: { frontMatter: 'roman-lower' as const, body: 'arabic' as const },
        rectoOpenings: false,
        orphans: 2,
        widows: 2,
        parents: [],
        endnotePlacement: 'book' as const,
        contents: { pageNumbers: true, depth: 2 },
        runningHead: { recto: 'title' as const, verso: 'title' as const },
      },
    }
    const html = bookViewDocument(view, { nonce: 'held', fontCss: '.lead{color:blue}', css: '.lead{color:green}' })
    expect(html).not.toContain('example.test')
    expect(html.indexOf('.lead{color:blue}')).toBeLessThan(html.indexOf('.lead{color:purple;}'))
    expect(html.indexOf('.lead{color:purple;}')).toBeLessThan(html.indexOf('.lead{color:green}'))
  })
})

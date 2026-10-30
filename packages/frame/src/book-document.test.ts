import { describe, expect, test } from 'bun:test'
import { Book, PX_PER_MM, resolveDirection } from '@segnavia/format'
import { heldPageNumber, openerPageIndex, pageIndexForTarget, paginateScript, printedPageAt, selectBookParent, windowPageIndex } from '@segnavia/html'
import { pixelPhaseOffset } from './book-composer.ts'
import { BOOK_COMPOSER_SCRIPT, bookDocument, bookViewDocument, PaginatedBookRefusedError } from './book-document.ts'
import { pageScale, spreadSlots } from './book-presentation.ts'
import { flowViewDocument } from './book-view-document.ts'
import { MESSAGE } from './bridge.ts'

const book = Book.parse({
  title: 'Book',
  mode: 'paginated',
  lang: 'he',
  page: { paper: 'a5', margin: { top: 12, bottom: 12, inner: 15, outer: 10 } },
  chapters: [{ title: 'א', html: '<p>טקסט<span data-note="footnote">הערה</span></p>' }],
})

describe('bookDocument', () => {
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
              contents: `import { embeddedComposerFunctions } from ${JSON.stringify(`${import.meta.dir}/book-composer.ts`)}; export const script = embeddedComposerFunctions();`,
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
    const embedded = new Function(`${script};return {spreadSlots,pageScale}`)() as {
      spreadSlots: typeof spreadSlots
      pageScale: typeof pageScale
    }
    expect(embedded.spreadSlots(4)).toBe(spreadSlots(4))
    expect(embedded.pageScale(300, 200, 2)).toBe(pageScale(300, 200, 2))
  })

  test('embeds the planner, furniture fill and parent-page planner under the bridge nonce', () => {
    const html = bookDocument(book, { nonce: 'held' })
    expect(html.match(/<script nonce="held">/g)?.length).toBeGreaterThanOrEqual(1)
    expect(html).toContain('data-segnavia-galleys')
    expect(html).toContain('data-segnavia-flow="segnavia-chapter-1"')
    expect(html).toContain('data-segnavia-notes-galley')
    expect(html).toContain('"direction":"rtl"')
    expect(BOOK_COMPOSER_SCRIPT).toContain(paginateScript())
    expect(BOOK_COMPOSER_SCRIPT).toContain(printedPageAt.toString())
    expect(BOOK_COMPOSER_SCRIPT).toContain(selectBookParent.toString())
    expect(BOOK_COMPOSER_SCRIPT).toContain(heldPageNumber.toString())
    expect(BOOK_COMPOSER_SCRIPT).toContain(windowPageIndex.toString())
    expect(BOOK_COMPOSER_SCRIPT).toContain(openerPageIndex.toString())
    expect(BOOK_COMPOSER_SCRIPT).toContain(pageIndexForTarget.toString())
    expect(BOOK_COMPOSER_SCRIPT).toContain('paginateBook')
    expect(BOOK_COMPOSER_SCRIPT).toContain('fillBookFurniture')
    expect(BOOK_COMPOSER_SCRIPT).toContain('parent.textArea')
    expect(BOOK_COMPOSER_SCRIPT).toContain("flows[f].style.setProperty('--segnavia-text-height',area.height+'px')")
    expect(BOOK_COMPOSER_SCRIPT).toContain("note.style.setProperty('--segnavia-text-height',area.height+'px')")
    expect(BOOK_COMPOSER_SCRIPT).toContain('data-segnavia-table-header')
    expect(BOOK_COMPOSER_SCRIPT).toContain('for(var w=0;w<page.windows.length;w++)')
    expect(BOOK_COMPOSER_SCRIPT).toContain('flowInlineStart')
    expect(BOOK_COMPOSER_SCRIPT).toContain(resolveDirection.toString())
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

  test('caps a flow galley at its shortest text-holding parent', () => {
    const held = Book.parse({
      title: 'Book',
      mode: 'paginated',
      page: { paper: 'a5', margin: { top: 10, bottom: 10, inner: 15, outer: 10 } },
      parentPages: [
        { name: 'tall', margin: { top: 5, bottom: 5, inner: 15, outer: 10 } },
        { name: 'short&body', margin: { top: 30, bottom: 30, inner: 15, outer: 10 } },
      ],
      chapters: [{ title: 'One', html: '<img alt="Tall">', parents: { opener: 'tall', recto: 'short&body', verso: 'short&body' } }],
    })
    const html = bookDocument(held, { nonce: 'held' })
    const area = { width: 123 * PX_PER_MM, height: 150 * PX_PER_MM }
    expect(html).toContain(`"flowTextAreas":{"segnavia-chapter-1":${JSON.stringify(area)}}`)
    expect(BOOK_COMPOSER_SCRIPT).toContain('config.flowTextAreas')
  })

  test('refuses a continuous book and a document with issues', () => {
    const continuous = Book.parse({ title: 'Book', mode: 'continuous', page: book.page, chapters: book.chapters })
    expect(() => bookDocument(continuous, { nonce: 'held' })).toThrow(PaginatedBookRefusedError)
    expect(() => bookDocument(continuous, { nonce: 'held' })).toThrow('mode paginated and page')
    const issues = Book.parse({
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
    expect(html).toContain('attributeFilter:[name]')
    expect(html).toContain('overflow:clip')
  })

  test('builds a screen document from a paginated view without changing the print document', () => {
    const view = {
      html: '<style>.first-build-style{color:red}</style><main data-segnavia-galleys>Held<style>.second-build-style{color:blue}</style></main>',
      flow: '<style>:where([data-segnavia-flow]){color:green}</style><section id="chapter" data-segnavia-flow="chapter">Flow</section>',
      scripts: 'refuse' as const,
      pagination: {
        paper: { width: 148, height: 210 },
        margin: { top: 12, bottom: 12, inner: 15, outer: 10 },
        columnGap: 4,
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
    expect(screen).toContain('"screen":{"spread":true}')
    expect(screen).toContain('<style>.first-build-style{color:red}</style>')
    expect(screen).toContain('<style>.second-build-style{color:blue}</style>')
    expect(screen).not.toContain('<template data-segnavia-flow-build>')
    expect(screen).not.toContain('data-segnavia-flow-view')
    expect(screen).toContain('event.source!==parent')
    expect(screen).toContain(`data.type!=='${MESSAGE.bookLayout}'`)
    expect(screen).toContain('BOOK_LAYOUTS.indexOf(data.layout)<0')
    expect(screen).toContain('data.place!==undefined&&place===undefined')
    expect(screen).toContain(`type:'${MESSAGE.bookPlace}'`)
    expect(screen).toContain('var settleBookPlace=function(key){scalePages();scrollTo(')
    expect(flow).toContain(view.flow)
    expect(flow).not.toContain(view.html)
    expect(flow).toContain('event.source!==parent')
    expect(flow).toContain('BOOK_LAYOUTS.indexOf(data.layout)<0')
    expect(flow).toContain('data.place!==undefined&&place===undefined')
    expect(flow).toContain('var settleBookPlace=function(key){scrollTo(')
    expect(print).not.toContain('"screen"')
    expect(print).not.toContain('<template data-segnavia-flow-build>')
    expect(print).not.toContain(MESSAGE.bookLayout)
    expect(print).not.toContain(MESSAGE.bookPlace)
    expect(print).not.toContain('BOOK_LAYOUTS.indexOf(data.layout)')
  })

  test('places sanitized book CSS between generated fonts and host CSS', () => {
    const view = {
      html: '<main data-segnavia-galleys><p class="lead">Held</p></main>',
      css: '.lead{color:purple;background:url(https://example.test/ink.png)}',
      scripts: 'refuse' as const,
      pagination: {
        paper: { width: 148, height: 210 },
        margin: { top: 12, bottom: 12, inner: 15, outer: 10 },
        columnGap: 4,
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

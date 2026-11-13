import { expect, test } from 'bun:test'
import { applyOps, type DocumentInput, deterministicNewId, fingerprintDocument, inverseBatch } from '@segnavia/format'
import { setBlock } from './block-ops.ts'
import { blockView } from './block-view.ts'
import { BLOCK_ELEMENTS, pageOrPrintedFromInput, parseDocument } from './document.ts'

function counter() {
  let value = 0
  return () => `minted-${++value}`
}

const page = (body: { html: string } | { markdown: string }): DocumentInput => ({
  type: 'document',
  kind: 'page',
  children: [{ type: 'page', body }],
})

test('the exported block table controls id minting and inline elements get no id', () => {
  const source = `${BLOCK_ELEMENTS.map((name) => `<${name}>block</${name}>`).join('')}<span>span</span><em>em</em>`
  const parsed = parseDocument(page({ html: source }), { newId: counter() })
  const body = parsed.children[0]?.type === 'page' ? parsed.children[0].body : undefined
  expect(body && 'html' in body ? body.html.match(/data-segnavia-id=/g)?.length : 0).toBe(BLOCK_ELEMENTS.length)
  expect(body && 'html' in body ? body.html : '').not.toMatch(/<(?:span|em)[^>]*data-segnavia-id/)
})

test('keeps existing block ids, converts markdown once, and parsing twice is the identity', () => {
  const markdown = '# Heading\n\nParagraph'
  const newId = counter()
  const parsed = parseDocument(page({ markdown }), { newId })
  const twice = parseDocument(parsed, { newId })
  expect(twice).toEqual(parsed)
  const body = parsed.children[0]?.type === 'page' ? parsed.children[0].body : undefined
  expect(body).toMatchObject({ markdown })
  expect(body && 'html' in body ? body.html : '').toContain('<h1 id="heading" data-segnavia-id="minted-3">')

  const existing = parseDocument(page({ html: '<p data-segnavia-id="kept">Text</p>' }), { newId: counter() })
  const existingBody = existing.children[0]?.type === 'page' ? existing.children[0].body : undefined
  expect(existingBody && 'html' in existingBody ? existingBody.html : '').toContain('data-segnavia-id="kept"')
})

test('refuses unknown heading listing values with the accepted list', () => {
  expect(() => parseDocument(page({ html: '<h1 data-segnavia-listed="somewhere">Heading</h1>' }), { newId: counter() })).toThrow(
    'data-segnavia-listed value "somewhere" is not accepted; use one of none, outline, contents to clear this refusal',
  )
})

test('refuses data-contents=exclude and names the replacement attribute', () => {
  expect(() => parseDocument(page({ html: '<h1 data-contents="exclude">Heading</h1>' }), { newId: counter() })).toThrow(/data-segnavia-listed="outline"/)
})

test('accepts valid form fields and refuses each malformed field value', () => {
  const valid = parseDocument(
    page({
      html: '<p>Name <span data-segnavia-field="line" data-segnavia-field-length="12ch">Ada</span></p><div data-segnavia-field="box" data-segnavia-field-lines="3" data-segnavia-field-rule="ruled">Work</div><p><span data-segnavia-field="checkbox" data-segnavia-field-checked></span></p>',
    }),
    { newId: counter() },
  )
  const validBody = valid.children[0]?.type === 'page' ? valid.children[0].body : undefined
  expect(validBody && 'html' in validBody ? validBody.html : '').toContain('data-segnavia-field="box"')
  const refusals = [
    ['<span data-segnavia-field="choice"></span>', 'data-segnavia-field value "choice" is not accepted; use one of checkbox, line, box'],
    ['<span data-segnavia-field="line" data-segnavia-field-length="12px"></span>', 'data-segnavia-field-length value "12px" is not accepted'],
    ['<div data-segnavia-field="box" data-segnavia-field-lines="0"></div>', 'data-segnavia-field-lines value "0" is not accepted'],
    ['<div data-segnavia-field="box" data-segnavia-field-rule="lines"></div>', 'data-segnavia-field-rule value "lines" is not accepted'],
    ['<span data-segnavia-field="checkbox" data-segnavia-field-checked="yes"></span>', 'data-segnavia-field-checked is a presence attribute'],
    ['<p data-segnavia-field="line"></p>', 'data-segnavia-field line needs a span'],
    ['<span data-segnavia-field="box"></span>', 'data-segnavia-field box needs a div'],
    ['<div data-segnavia-field="box" data-segnavia-field-length="10ch"></div>', 'data-segnavia-field-length belongs only to a line field'],
    ['<span data-segnavia-field="line" data-segnavia-field-lines="2"></span>', 'data-segnavia-field-lines belongs only to a box field'],
    ['<span data-segnavia-field="checkbox" data-segnavia-field-rule="ruled"></span>', 'data-segnavia-field-rule belongs only to a box field'],
    ['<div data-segnavia-field="box" data-segnavia-field-checked></div>', 'data-segnavia-field-checked belongs only to a checkbox field'],
    ['<span data-segnavia-field-length="10ch"></span>', 'field options have no field'],
    ['<span data-segnavia-field="line" data-segnavia-field-length="0em"></span>', 'data-segnavia-field-length value "0em" is not accepted'],
    [
      '<span data-segnavia-field="line" data-segnavia-field-length="1.50em"></span>',
      'use a positive number in canonical form followed by em or ch, like 1.5em or 12ch',
    ],
    ['<div data-segnavia-field="box" data-segnavia-field-lines="05"></div>', 'use a whole number from 1 to 99 without leading zeros'],
  ] as const
  for (const [html, message] of refusals) expect(() => parseDocument(page({ html }), { newId: counter() })).toThrow(message)
})

test('deterministic ids are repeatable and unique across missing nodes and Hebrew blocks', () => {
  const input = {
    type: 'document' as const,
    kind: 'book' as const,
    id: 'hebrew',
    title: 'ספר',
    mode: 'paginated' as const,
    page: { paper: 'a5' as const, margin: { blockStart: 12, blockEnd: 12, inlineStart: 12, inlineEnd: 12 } },
    children: [
      {
        type: 'section' as const,
        id: 'hebrew-1',
        title: 'ספר',
        children: [
          {
            type: 'page' as const,
            body: {
              html: '<section dir="rtl" lang="he"><p data-segnavia-id="hebrew-2">קיים</p><h1>כותרת</h1><p>תוכן</p><figure>איור</figure></section>',
            },
          },
          {
            type: 'page' as const,
            body: { html: '<p DATA-SEGNAVIA-ID="hebrew-4">קיים נוסף</p><p>תוכן נוסף</p>' },
          },
          {
            type: 'page' as const,
            body: { html: '<h2 id="hebrew-6">עוגן</h2><p>עמוד שלישי</p>' },
          },
        ],
      },
    ],
  }
  const first = parseDocument(input, { newId: deterministicNewId(input) })
  const second = parseDocument(input, { newId: deterministicNewId(input) })

  expect(second).toEqual(first)
  expect(first.children[0]?.id).toBe('hebrew-1')
  const nodeIds = first.children.flatMap((node) => ('children' in node ? [node.id, ...node.children.map((child) => child.id)] : [node.id]))
  const blockIds = first.children.flatMap((node) =>
    'children' in node
      ? node.children.flatMap((child) =>
          child.type === 'page' && child.body && 'html' in child.body
            ? [...child.body.html.matchAll(/data-segnavia-id="([^"]+)"/g)].flatMap((match) => (match[1] ? [match[1]] : []))
            : [],
        )
      : [],
  )
  const carriedIds = new Set(['hebrew-1', 'hebrew-2', 'hebrew-4', 'hebrew-6'])
  const mintedIds = [...nodeIds, ...blockIds].filter((id) => !carriedIds.has(id))
  const documentIds = [...nodeIds, ...blockIds, 'hebrew-6']
  expect(mintedIds).toEqual(['hebrew-3', 'hebrew-5', 'hebrew-7', 'hebrew-8', 'hebrew-9', 'hebrew-10', 'hebrew-11', 'hebrew-12', 'hebrew-13'])
  expect(new Set(documentIds).size).toBe(documentIds.length)
})

test('keeps Hebrew markdown and its direction through an edit inverse and another parse', () => {
  const markdown = '> [!NOTE]\n> שלום'
  const parsed = parseDocument(
    { type: 'document', kind: 'page', settings: { dir: 'rtl', lang: 'he' }, children: [{ type: 'page', body: { markdown } }] },
    { newId: counter() },
  )
  const body = parsed.children[0]?.type === 'page' ? parsed.children[0].body : undefined
  expect(body?.markdown).toBe(markdown)
  expect(body && 'html' in body ? body.html : '').toContain('<bdi>הערה</bdi>')
  const paragraph = blockView(parsed).find(({ kind }) => kind === 'p')
  if (!paragraph) throw new Error('Hebrew markdown paragraph missing')
  const batch = { base: fingerprintDocument(parsed), ops: setBlock(parsed, paragraph.id, { text: 'חדש' }) }
  const edited = applyOps(parsed, batch)
  expect(edited.children[0]).not.toHaveProperty('body.markdown')
  const restored = applyOps(edited, inverseBatch(batch, edited))
  expect(restored).toEqual(parsed)
  expect(parseDocument(restored, { newId: counter() })).toEqual(parsed)
})

test('uses host alert labels while converting markdown at the content edge', () => {
  const parsed = parseDocument(page({ markdown: '> [!NOTE]\n> Read this.' }), {
    newId: counter(),
    alertLabels: { note: 'Memo' },
  })
  const body = parsed.children[0]?.type === 'page' ? parsed.children[0].body : undefined
  expect(body && 'html' in body ? body.html : '').toContain('<bdi>Memo</bdi>')
})

test('refuses duplicate block ids with both blocks and the clearance', () => {
  expect(() => parseDocument(page({ html: '<p data-segnavia-id="same">One</p><figure data-segnavia-id="same">Two</figure>' }), { newId: counter() })).toThrow(
    /block id "same".*<p>.*<figure>.*change or remove one data-segnavia-id to clear this refusal/,
  )
})

test('accepts line numbers in flowing content and refuses fixed page and template content', () => {
  const settings = { lineNumbers: {} }
  expect(() =>
    parseDocument({
      type: 'document',
      kind: 'printed',
      print: { paper: 'a4' },
      settings,
      parentRules: [{ parent: 'body' }],
      parentPages: [{ type: 'parentPage', name: 'body' }],
      children: [{ type: 'page', body: { html: '<p data-line-numbers>Printed text</p>' } }],
    }),
  ).not.toThrow()
  const fixedBook = {
    type: 'document' as const,
    kind: 'book' as const,
    metadata: { title: 'Book' },
    mode: 'paginated' as const,
    settings,
    page: { paper: 'a5' as const, margin: { blockStart: 12, blockEnd: 12, inlineStart: 12, inlineEnd: 12 } },
    children: [{ type: 'section' as const, title: 'Pages', children: [{ type: 'page' as const, body: { html: '<p data-line-numbers>Designed text</p>' } }] }],
  }
  expect(() => parseDocument(fixedBook)).toThrow('line numbers number flowing text')
  expect(() =>
    parseDocument({
      ...fixedBook,
      children: [{ type: 'section', title: 'Text', children: [{ type: 'flow', html: '<p>Flowing text</p>' }] }],
      templates: [{ type: 'template', name: 'plate', html: '<main data-line-numbers></main>' }],
    }),
  ).toThrow('line numbers number flowing text')
})

test('refuses line numbers in a non-flowing designed page region', () => {
  expect(() =>
    parseDocument({
      type: 'document',
      kind: 'book',
      metadata: { title: 'Book' },
      mode: 'paginated',
      settings: { lineNumbers: {} },
      page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 12, inlineEnd: 12 } },
      templates: [{ type: 'template', name: 'plate', html: '<main data-region="body"></main>' }],
      children: [
        {
          type: 'section',
          title: 'Pages',
          template: 'plate',
          children: [{ type: 'page', regions: { body: '<p data-line-numbers>Region text</p>' } }],
        },
      ],
    }),
  ).toThrow('line numbers number flowing text')
})

test('accepts measured blocks with authored ids in a designed page region', () => {
  expect(() =>
    parseDocument({
      type: 'document',
      kind: 'book',
      metadata: { title: 'Book' },
      mode: 'paginated',
      page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 12, inlineEnd: 12 } },
      templates: [{ type: 'template', name: 'plate', html: '<main data-region="body"></main>' }],
      children: [
        {
          type: 'section',
          title: 'Pages',
          template: 'plate',
          children: [
            {
              type: 'page',
              regions: { body: '<p data-segnavia-id="measured" data-measure="block" data-measure-as="--h">Region text</p>' },
            },
          ],
        },
      ],
    }),
  ).not.toThrow()
})

test('keeps active content for the later realize policy', () => {
  const source =
    '<link rel="stylesheet" href="https://fonts.example/css?family=Fixture"><style>@font-face{font-family:x;src:url(https://fonts.example/x/v1/font.woff2)}</style><form><button>Send</button></form><script src="https://cdn.example/library@1.0.0/index.js"></script>'
  const parsed = parseDocument(
    { type: 'document', kind: 'page', settings: { scripts: 'sandboxed' }, children: [{ type: 'page', body: { html: source } }] },
    { newId: counter() },
  )
  const body = parsed.children[0]?.type === 'page' ? parsed.children[0].body : undefined
  const html = body && 'html' in body ? body.html : ''
  expect(html).toContain('href="https://fonts.example/css?family=Fixture"')
  expect(html).toContain('https://fonts.example/x/v1/font.woff2')
  expect(html).toContain('<form><button>Send</button></form>')
  expect(html).toContain('src="https://cdn.example/library@1.0.0/index.js"')
})

test('pageOrPrintedFromInput refuses to lower a named brand', () => {
  expect(() =>
    pageOrPrintedFromInput({
      type: 'document',
      kind: 'page',
      brand: 'house',
      children: [{ type: 'page', body: { html: '<p>Page</p>' } }],
    }),
  ).toThrow('Document names brand "house"; resolve it with resolveBrand, then lower with pageOrPrintedFromDocument(document, brand) to clear this refusal.')
})

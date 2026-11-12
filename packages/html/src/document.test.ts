import { expect, test } from 'bun:test'
import { type DocumentInput, deterministicNewId } from '@segnavia/format'
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
  const newId = counter()
  const parsed = parseDocument(page({ markdown: '# Heading\n\nParagraph' }), { newId })
  const twice = parseDocument(parsed, { newId })
  expect(twice).toEqual(parsed)
  const body = parsed.children[0]?.type === 'page' ? parsed.children[0].body : undefined
  expect(body && 'html' in body ? body.html : '').toContain('<h1 id="heading" data-segnavia-id="minted-3">')

  const existing = parseDocument(page({ html: '<p data-segnavia-id="kept">Text</p>' }), { newId: counter() })
  const existingBody = existing.children[0]?.type === 'page' ? existing.children[0].body : undefined
  expect(existingBody && 'html' in existingBody ? existingBody.html : '').toContain('data-segnavia-id="kept"')
})

test('deterministic ids are repeatable and skip existing node and Hebrew block ids', () => {
  const input = {
    type: 'document' as const,
    kind: 'page' as const,
    id: 'hebrew',
    children: [
      {
        type: 'page' as const,
        id: 'hebrew-1',
        body: {
          html: '<section dir="rtl" lang="he"><p data-segnavia-id="hebrew-2">קיים</p><h1>כותרת</h1><p>תוכן</p><figure>איור</figure></section>',
        },
      },
    ],
  }
  const first = parseDocument(input, { newId: deterministicNewId(input) })
  const second = parseDocument(input, { newId: deterministicNewId(input) })

  expect(second).toEqual(first)
  expect(first.children[0]?.id).toBe('hebrew-1')
  const body = first.children[0]?.type === 'page' ? first.children[0].body : undefined
  const ids = body && 'html' in body ? [...body.html.matchAll(/data-segnavia-id="([^"]+)"/g)].map((match) => match[1]) : []
  expect(ids).toEqual(['hebrew-2', 'hebrew-3', 'hebrew-4', 'hebrew-5'])
  expect(new Set(ids).size).toBe(ids.length)
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

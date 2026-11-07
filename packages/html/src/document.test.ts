import { expect, test } from 'bun:test'
import type { DocumentInput } from '@segnavia/format'
import { BLOCK_ELEMENTS, parseDocument } from './document.ts'

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

test('refuses duplicate block ids with both blocks and the clearance', () => {
  expect(() => parseDocument(page({ html: '<p data-segnavia-id="same">One</p><figure data-segnavia-id="same">Two</figure>' }), { newId: counter() })).toThrow(
    /block id "same".*<p>.*<figure>.*change or remove one data-segnavia-id to clear this refusal/,
  )
})

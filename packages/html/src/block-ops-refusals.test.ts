import { expect, test } from 'bun:test'
import type { Document } from '@segnavia/format'
import { insertBlock, moveBlock, setBlock } from './block-ops.ts'
import { parseDocument } from './document.ts'

function page(html: string): Document {
  let next = 0
  return parseDocument({ type: 'document', kind: 'page', children: [{ type: 'page', body: { html } }] }, { newId: () => `mint-${++next}` })
}

test('refuses an unknown block id with the source that clears it', () => {
  expect(() => setBlock(page('<p data-segnavia-id="known">Known</p>'), 'missing', { text: 'No' })).toThrow(
    /block id "missing" is unknown; use an id from blockView\(document\) to clear this refusal/,
  )
})

test('refuses an unknown content address with the source that clears it', () => {
  const document = page('<p data-segnavia-id="known">Known</p>')
  expect(() => insertBlock(document, { html: '<p>New</p>', position: { in: { node: 'missing', field: 'body' }, at: 'end' } })).toThrow(
    /content address node "missing" field "body" is unknown; use a present HTML content field/,
  )
})

test('refuses insert html that is not exactly one block element', () => {
  const document = page('<p data-segnavia-id="known">Known</p>')
  expect(() => insertBlock(document, { html: '<p>One</p><p>Two</p>', position: { before: 'known' } })).toThrow(
    /not exactly one block element; supply one element named by BLOCK_ELEMENTS/,
  )
})

test('refuses a supplied block id already used in the document and names both places', () => {
  const document = page('<p data-segnavia-id="used">Known</p>')
  expect(() => insertBlock(document, { html: '<figure data-segnavia-id="used">New</figure>', position: { after: 'used' } })).toThrow(
    /supplied data-segnavia-id "used" is already used by <p> in node .* and <figure> in the supplied html; change or remove one/,
  )
})

test('refuses html and text supplied together', () => {
  expect(() => setBlock(page('<p data-segnavia-id="known">Known</p>'), 'known', { html: '<em>HTML</em>', text: 'Text' })).toThrow(
    /html and text were supplied together; remove one to clear this refusal/,
  )
})

test('refuses a block in a disallowed context and names the accepted parents', () => {
  const document = page('<p data-segnavia-id="known">Known</p>')
  expect(() => insertBlock(document, { html: '<li>Item</li>', position: { after: 'known' } })).toThrow(
    /block kind "li" cannot stand in parent "fragment"; place it directly in ul or ol/,
  )
})

test('refuses moving a block into its own descendant', () => {
  const document = page('<figure data-segnavia-id="outer"><p data-segnavia-id="inner">Inner</p></figure>')
  expect(() => moveBlock(document, 'outer', { after: 'inner' })).toThrow(
    /block id "outer" cannot move into its own descendant; choose a position outside that block/,
  )
})

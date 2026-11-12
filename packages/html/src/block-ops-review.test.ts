import { expect, test } from 'bun:test'
import { applyOps, type Document, fingerprintDocument, inverseBatch } from '@segnavia/format'
import { insertBlock, moveBlock, setBlock } from './block-ops.ts'
import { blockElements, blockView } from './block-view.ts'
import { parseDocument } from './document.ts'
import { parse, serialize } from './sanitize.ts'

function page(html: string): Document {
  let next = 0
  return parseDocument({ type: 'document', kind: 'page', children: [{ type: 'page', id: 'page', body: { html } }] }, { newId: () => `node-${++next}` })
}

function apply(document: Document, ops: ReturnType<typeof setBlock>): Document {
  return applyOps(document, { base: fingerprintDocument(document), ops })
}

function body(document: Document): string {
  const node = document.children[0]
  if (node?.type !== 'page' || !node.body || !('html' in node.body)) throw new Error('page body missing')
  return node.body.html
}

test('setBlock html keeps its id, mints nested ids, and preserves sibling serialization', () => {
  const document = page('<figure data-segnavia-id="one">Old</figure><p data-segnavia-id="two">Other</p>')
  const sibling = serialize(blockElements(parse(body(document)).children)[1] as NonNullable<ReturnType<typeof blockElements>[number]>)
  let next = 0
  const after = apply(document, setBlock(document, 'one', { html: '<div><p>New</p></div>' }, { newId: () => `nested-${++next}` }))
  expect(body(after)).toContain('<figure data-segnavia-id="one"><div><p data-segnavia-id="nested-1">New</p></div></figure>')
  expect(serialize(blockElements(parse(body(after)).children)[2] as NonNullable<ReturnType<typeof blockElements>[number]>)).toBe(sibling)
})

test('a block edit clears the markdown source and its inverse restores it', () => {
  let next = 0
  const document = parseDocument(
    { type: 'document', kind: 'page', children: [{ type: 'page', id: 'page', body: { markdown: 'Old' } }] },
    { newId: () => `source-${++next}` },
  )
  const ops = setBlock(document, 'source-2', { text: 'New' })
  const batch = { base: fingerprintDocument(document), ops }
  const after = applyOps(document, batch)
  expect(body(after)).toContain('New')
  expect(after.children[0]).not.toHaveProperty('body.markdown')
  expect(applyOps(after, inverseBatch(batch, after))).toEqual(document)
})

test('setBlock html identifies block descendants exactly once with and without supplied ids', () => {
  const document = page('<figure data-segnavia-id="one">Old</figure>')
  let next = 0
  expect(() => setBlock(document, 'one', { html: '<ul><li><div><p>inner</p></div></li></ul>' }, { newId: () => `new-${++next}` })).not.toThrow()
  expect(() => setBlock(document, 'one', { html: '<ul><li data-segnavia-id="li"><div><p data-segnavia-id="p">inner</p></div></li></ul>' })).not.toThrow()
})

test('setBlock newId makes nested block minting reproducible', () => {
  const document = page('<figure data-segnavia-id="one">Old</figure>')
  const edit = () => {
    let next = 0
    return setBlock(document, 'one', { html: '<p>New</p>' }, { newId: () => `repeat-${++next}` })
  }
  expect(edit()).toEqual(edit())
})

test('setBlock kind changes the serialized tag and block view only for the target', () => {
  const document = page('<p data-segnavia-id="one">One</p><p data-segnavia-id="two">Two</p>')
  const after = apply(document, setBlock(document, 'one', { kind: 'h1' }))
  expect(blockView(after).map(({ id, kind }) => ({ id, kind }))).toEqual([
    { id: 'one', kind: 'h1' },
    { id: 'two', kind: 'p' },
  ])
  expect(body(after)).toBe('<h1 data-segnavia-id="one">One</h1><p data-segnavia-id="two">Two</p>')
})

test('in positions insert at a fragment start and move to its end', () => {
  const document = page('<p data-segnavia-id="one">One</p><p data-segnavia-id="two">Two</p>')
  const inserted = insertBlock(document, { html: '<p>Zero</p>', position: { in: { node: 'page', field: 'body' }, at: 'start' } }, { newId: () => 'zero' })
  const afterInsert = apply(document, inserted.ops)
  expect(blockView(afterInsert).map(({ id }) => id)).toEqual(['zero', 'one', 'two'])
  const afterMove = apply(afterInsert, moveBlock(afterInsert, 'zero', { in: { node: 'page', field: 'body' }, at: 'end' }))
  expect(blockView(afterMove).map(({ id }) => id)).toEqual(['one', 'two', 'zero'])
})

test('a move between region keys compiles to one invertible field op', () => {
  const document = parseDocument({
    type: 'document',
    kind: 'book',
    title: 'Book',
    mode: 'continuous',
    children: [
      {
        type: 'section',
        id: 'section',
        template: 'template',
        children: [{ type: 'page', id: 'page', regions: { main: '<p data-segnavia-id="moving">M</p>', side: '<p data-segnavia-id="side">S</p>' } }],
      },
    ],
    templates: [{ type: 'template', id: 'template', name: 'template', html: '<div></div>' }],
  })
  const ops = moveBlock(document, 'moving', { in: { node: 'page', field: 'regions', key: 'side' }, at: 'end' })
  expect(ops).toHaveLength(1)
  const batch = { base: fingerprintDocument(document), ops }
  const after = applyOps(document, batch)
  expect(
    blockView(after)
      .filter(({ address }) => address.field === 'regions')
      .map(({ id }) => id),
  ).toEqual(['side', 'moving'])
  expect(applyOps(after, inverseBatch(batch, after))).toEqual(document)
})

test('an empty supplied block id is treated as absent and minted', () => {
  const document = page('<p data-segnavia-id="known">Known</p>')
  const inserted = insertBlock(document, { html: '<p data-segnavia-id="">New</p>', position: { before: 'known' } }, { newId: () => 'minted' })
  expect(inserted.id).toBe('minted')
  expect(blockView(apply(document, inserted.ops)).map(({ id }) => id)).toEqual(['minted', 'known'])
})

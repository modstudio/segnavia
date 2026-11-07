import { expect, test } from 'bun:test'
import { applyOps, type Document, fingerprintDocument, inverseBatch } from '@segnavia/format'
import { insertBlock, moveBlock, removeBlock, setBlock } from './block-ops.ts'
import { blockView } from './block-view.ts'
import { parseDocument } from './document.ts'

const HEBREW = 'בְּרֵאשִׁ֖ית בָּרָ֣א'

function page(html: string): Document {
  let next = 0
  return parseDocument({ type: 'document', kind: 'page', children: [{ type: 'page', body: { html } }] }, { newId: () => `mint-${++next}` })
}

function apply(document: Document, ops: ReturnType<typeof setBlock>): Document {
  return applyOps(document, { base: fingerprintDocument(document), ops })
}

test('views every block in order with content addresses, attributes, Hebrew text, and nearest block parents', () => {
  const document = page(
    `<figure data-segnavia-id="figure" class="plate" dir="rtl" lang="he"><p data-segnavia-id="caption">${HEBREW}</p></figure>` +
      '<ul><li data-segnavia-id="outer">Outer<ul><li data-segnavia-id="inner">Inner</li></ul></li></ul>',
  )
  expect(blockView(document)).toEqual([
    {
      id: 'figure',
      kind: 'figure',
      text: HEBREW,
      class: 'plate',
      attributes: { dir: 'rtl', lang: 'he' },
      address: { node: 'mint-2', field: 'body' },
    },
    { id: 'caption', kind: 'p', text: HEBREW, attributes: {}, address: { node: 'mint-2', field: 'body' }, parent: 'figure' },
    { id: 'outer', kind: 'li', text: 'OuterInner', attributes: {}, address: { node: 'mint-2', field: 'body' } },
    { id: 'inner', kind: 'li', text: 'Inner', attributes: {}, address: { node: 'mint-2', field: 'body' }, parent: 'outer' },
  ])
})

test('Hebrew and active content survive every block op, applyOps, and inverseBatch byte for byte', () => {
  const document = page(`<p data-segnavia-id="hebrew" dir="rtl" lang="he">${HEBREW}<script>active()</script></p><p data-segnavia-id="other">Other</p>`)
  const original = document
  const batches = [
    setBlock(document, 'hebrew', { class: 'primary' }),
    insertBlock(document, { html: `<p dir="rtl" lang="he">${HEBREW}</p>`, position: { after: 'hebrew' } }, { newId: () => 'inserted' }).ops,
    moveBlock(document, 'other', { before: 'hebrew' }),
    removeBlock(document, 'other'),
  ]
  for (const ops of batches) {
    const batch = { base: fingerprintDocument(document), ops }
    const after = applyOps(document, batch)
    expect(blockView(after).find(({ id }) => id === 'hebrew')).toMatchObject({ text: `${HEBREW}active()`, attributes: { dir: 'rtl', lang: 'he' } })
    const body = after.children[0]?.type === 'page' ? after.children[0].body : undefined
    expect(body && 'html' in body ? body.html : '').toContain(`${HEBREW}<script>active()</script>`)
    expect(applyOps(after, inverseBatch(batch, after))).toEqual(document)
  }
  expect(original).toEqual(document)
})

test('setBlock escapes text and never changes the block id through attributes', () => {
  const document = page('<p data-segnavia-id="one">Old</p>')
  const after = apply(document, setBlock(document, 'one', { text: '<em>literal</em>', attributes: { 'data-segnavia-id': 'changed', title: 'T' } }))
  expect(blockView(after)).toEqual([{ id: 'one', kind: 'p', text: '<em>literal</em>', attributes: { title: 'T' }, address: { node: 'mint-2', field: 'body' } }])
  const body = after.children[0]?.type === 'page' ? after.children[0].body : undefined
  expect(body && 'html' in body ? body.html : '').toContain('&lt;em&gt;literal&lt;/em&gt;')
})

test('a cross-fragment move compiles to removal then insertion and remains invertible', () => {
  let next = 0
  const document = parseDocument(
    {
      type: 'document',
      kind: 'deck',
      title: 'Deck',
      children: [
        { type: 'slide', content: { kind: 'html', html: '<p data-segnavia-id="moving">Moving</p>' } },
        { type: 'slide', content: { kind: 'html', html: '<p data-segnavia-id="target">Target</p>' } },
      ],
    },
    { newId: () => `deck-${++next}` },
  )
  const ops = moveBlock(document, 'moving', { after: 'target' })
  expect(ops).toHaveLength(2)
  const batch = { base: fingerprintDocument(document), ops }
  const after = applyOps(document, batch)
  expect(blockView(after).map(({ id }) => id)).toEqual(['target', 'moving'])
  expect(applyOps(after, inverseBatch(batch, after))).toEqual(document)
})

test('blockView refuses a structurally valid but unparsed document like fingerprintDocument', () => {
  expect(() => blockView({ type: 'document', kind: 'page', children: [{ type: 'page', body: { html: '<p>Missing ids</p>' } }] } as Document)).toThrow(
    /fingerprintDocument refused: document is not a parsed Document; parse it first/,
  )
})

import { expect, test } from 'bun:test'
import { DOCUMENT_NODE_MODEL, type DocumentNodeType } from '@segnavia/format'
import { BLOCK_CONTEXT, BLOCK_ELEMENTS } from './block-context.ts'
import { CONTENT_FIELD_SHAPES } from './block-fragments.ts'
import { insertBlock } from './block-ops.ts'
import { blockView } from './block-view.ts'
import { parseDocument } from './document.ts'

test('every format content field has one fragment shape or explicit text exclusion', () => {
  for (const type of Object.keys(DOCUMENT_NODE_MODEL) as DocumentNodeType[]) {
    expect(Object.keys(CONTENT_FIELD_SHAPES[type]).sort(), type).toEqual([...DOCUMENT_NODE_MODEL[type].content].sort())
  }
})

test('the context table and parser share exactly one block-kind vocabulary', () => {
  expect(Object.keys(BLOCK_CONTEXT)).toEqual([...BLOCK_ELEMENTS])
})

test('blockView addresses page regions and parent-page HTML fields', () => {
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
        children: [{ type: 'page', id: 'page', regions: { main: '<p data-segnavia-id="region">Region</p>' } }],
      },
    ],
    parentPages: [{ type: 'parentPage', id: 'parent', name: 'parent', regions: { head: { edge: 'blockStart', html: '<p data-segnavia-id="head">Head</p>' } } }],
    templates: [{ type: 'template', id: 'template', name: 'template', html: '<p data-segnavia-id="template-block">Template</p>' }],
  })
  expect(blockView(document).map(({ id, address }) => ({ id, address }))).toEqual([
    { id: 'region', address: { node: 'page', field: 'regions', key: 'main' } },
    { id: 'head', address: { node: 'parent', field: 'regions', key: 'head' } },
    { id: 'template-block', address: { node: 'template', field: 'html' } },
  ])
})

test('speaker notes are plain text: blockView ignores them and block positions refuse them', () => {
  const document = parseDocument({
    type: 'document',
    kind: 'deck',
    title: 'Deck',
    children: [
      { type: 'slide', id: 'slide', content: { kind: 'html', html: '<p data-segnavia-id="shown">Shown</p>' }, notes: 'Tom & Jerry <p>not a block</p>' },
    ],
  })
  expect(blockView(document).map(({ id }) => id)).toEqual(['shown'])
  expect(() => insertBlock(document, { html: '<p>New</p>', position: { in: { node: 'slide', field: 'notes' }, at: 'end' } }, { newId: () => 'new' })).toThrow(
    /content address node "slide" field "notes" is unknown/,
  )
})

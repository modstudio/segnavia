import { describe, expect, test } from 'bun:test'
import { applyOps, type Document, inverseBatch } from '@segnavia/format'
import { parseDocument } from './document.ts'
import { editDocument } from './edit-document.ts'

const bookWithParentRegion = () =>
  parseDocument({
    type: 'document',
    id: 'book',
    kind: 'book',
    metadata: { title: 'Book' },
    mode: 'continuous',
    children: [],
    parentPages: [
      {
        type: 'parentPage',
        id: 'parent',
        name: 'body',
        regions: { head: { edge: 'blockStart', html: '<p data-segnavia-id="old-head">Old</p>' } },
      },
    ],
  })

function expectComposes(input: Document, result: ReturnType<typeof editDocument>): asserts result is Extract<typeof result, { ok: true }> {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.refusal)
  expect(applyOps(input, result.batch)).toEqual(result.document)
  expect(applyOps(result.document, inverseBatch(result.batch, result.document))).toEqual(input)
}

describe('editDocument parent regions', () => {
  test('sets keyed HTML and keeps the region edge', () => {
    const input = bookWithParentRegion()
    const result = editDocument(input, [{ type: 'setContent', content: { node: { id: 'parent' }, field: 'regions', key: 'head' }, html: '<p>New</p>' }], {
      newId: () => 'new-head',
    })
    expectComposes(input, result)
    expect(result.document.parentPages[0]?.regions.head).toEqual({ edge: 'blockStart', html: '<p data-segnavia-id="new-head">New</p>' })
  })

  test('sets a keyed native value and keeps the region edge', () => {
    const input = bookWithParentRegion()
    const result = editDocument(
      input,
      [
        {
          type: 'setContent',
          content: { node: { id: 'parent' }, field: 'regions', key: 'head' },
          value: { edge: 'inlineEnd', html: '<p>Native</p>' },
        },
      ],
      { newId: () => 'native-head' },
    )
    expectComposes(input, result)
    expect(result.document.parentPages[0]?.regions.head).toEqual({ edge: 'blockStart', html: '<p data-segnavia-id="native-head">Native</p>' })
  })

  test('requires a region key', () => {
    expect(
      editDocument(bookWithParentRegion(), [{ type: 'setContent', content: { node: { id: 'parent' }, field: 'regions' }, html: '<p>Region</p>' }]),
    ).toEqual({
      ok: false,
      refusal: 'document command 0 (setContent) refused: record content field "regions" requires a key; supply the record key. Nothing was changed.',
    })
  })

  test('refuses an unknown region key', () => {
    expect(
      editDocument(bookWithParentRegion(), [
        { type: 'setContent', content: { node: { id: 'parent' }, field: 'regions', key: 'missing' }, html: '<p>Region</p>' },
      ]),
    ).toEqual({
      ok: false,
      refusal:
        'document command 0 (setContent) refused: region "missing" is not present in content field "regions"; add it with its edge through set on "regions". Nothing was changed.',
    })
  })

  test('identifies the region blocks of an added parent page', () => {
    const input = bookWithParentRegion()
    const result = editDocument(
      input,
      [
        {
          type: 'add',
          node: { type: 'parentPage', id: 'added-parent', name: 'added', regions: { head: { edge: 'blockStart', html: '<p>Added</p>' } } },
          at: { collection: 'parentPages' },
        },
      ],
      { newId: () => 'added-head' },
    )
    expectComposes(input, result)
    expect(result.document.parentPages[1]?.regions.head).toEqual({ edge: 'blockStart', html: '<p data-segnavia-id="added-head">Added</p>' })
  })
})

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
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 12, inlineEnd: 12 } },
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

const bookWithPageRegion = () =>
  parseDocument({
    type: 'document',
    id: 'book',
    kind: 'book',
    metadata: { title: 'Book' },
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 12, inlineEnd: 12 } },
    templates: [{ type: 'template', name: 'page', html: '<main data-region="body"></main>' }],
    children: [
      {
        type: 'section',
        id: 'section',
        template: 'page',
        children: [{ type: 'page', id: 'page', regions: { body: '<p data-segnavia-id="old-body">Old</p>' } }],
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
  test('applies the region edge rules to page and parent-page command writes', () => {
    const parent = bookWithParentRegion()
    const parentResult = editDocument(
      parent,
      [{ type: 'setContent', content: { node: { id: 'parent' }, field: 'regions', key: 'head' }, html: '<p data-fill="repeat">Head</p>' }],
      { newId: () => 'new-head' },
    )
    expect(parentResult.ok).toBe(true)
    expectComposes(parent, parentResult)

    const page = bookWithPageRegion()
    const pageResult = editDocument(
      page,
      [{ type: 'setContent', content: { node: { id: 'page' }, field: 'regions', key: 'body' }, html: '<p data-fill="repeat">Body</p>' }],
      { newId: () => 'new-body' },
    )
    expectComposes(page, pageResult)
  })

  test('keeps parent-page measure refusal on command writes', () => {
    const result = editDocument(
      bookWithParentRegion(),
      [
        {
          type: 'setContent',
          content: { node: { id: 'parent' }, field: 'regions', key: 'head' },
          html: '<p data-measure="block" data-measure-as="--height">Head</p>',
        },
      ],
      { newId: () => 'measured-head' },
    )
    expect(result).toMatchObject({ ok: false, refusal: expect.stringContaining('data-measure cannot take effect in a parent-page region') })
  })

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

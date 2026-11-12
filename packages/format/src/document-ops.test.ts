import { describe, expect, test } from 'bun:test'
import { Document } from './document.ts'
import { applyOps } from './document-apply.ts'
import { diffDocuments } from './document-diff.ts'
import { fingerprintDocument } from './document-fingerprint.ts'
import { inverseBatch, invertOps } from './document-invert.ts'
import { DocumentBatch, type DocumentOp } from './document-op.ts'
import { DOCUMENT_NODE_MODEL } from './document-op-model.ts'
import { generatedCandidateDocuments, generatedDocument, generatedDocumentOfKind, randomEdit, sampledNodeTypes } from './document-op-test-helper.ts'
import { rebaseOps } from './document-rebase.ts'
import { jsonSchemas } from './json-schemas.ts'

const CASES = 200

function property(name: string, body: (seed: number) => void): void {
  // vacuity-allow: every generated case executes assertions in the supplied property body
  test(name, () => {
    for (let seed = 0; seed < CASES; seed += 1) {
      try {
        body(seed)
      } catch (error) {
        throw new Error(`${name} failed with seed ${seed}`, { cause: error })
      }
    }
  })
}

function batch(document: ReturnType<typeof generatedDocument>, ops: DocumentOp[]): DocumentBatch {
  return { base: fingerprintDocument(document), ops }
}

function firstNode(document: ReturnType<typeof generatedDocument>) {
  const node = document.children[0]
  if (!node) throw new Error('test fixture has no first node')
  return node
}

describe('document operation properties', () => {
  property('diff then apply reproduces the target byte-for-byte for Hebrew content', (seed) => {
    const before = generatedDocument(seed)
    const after = randomEdit(before, seed)
    expect(applyOps(before, batch(before, diffDocuments(before, after)))).toEqual(after)
  })

  property('a forward batch followed by its inverse is the identity', (seed) => {
    const before = generatedDocument(seed)
    const target = randomEdit(before, seed)
    const forward = batch(before, diffDocuments(before, target))
    const after = applyOps(before, forward)
    expect(applyOps(after, inverseBatch(forward, after))).toEqual(before)
  })

  property('a JSON-round-tripped batch applies identically', (seed) => {
    const before = generatedDocument(seed)
    const target = randomEdit(before, seed)
    const forward = batch(before, diffDocuments(before, target))
    const roundTripped = JSON.parse(JSON.stringify(forward)) as DocumentBatch
    expect(applyOps(before, roundTripped)).toEqual(applyOps(before, forward))
  })

  property('a stale batch names a changed target or both fingerprints', (seed) => {
    const before = generatedDocument(seed)
    const target = randomEdit(before, seed)
    const forward = batch(before, diffDocuments(before, target))
    const current = target
    expect(() => applyOps(current, forward)).toThrow(/document batch stale:.*(node|expected fingerprint).*rebuild the batch against the current document/)
  })

  property('a mismatched prior refuses atomically', (seed) => {
    const before = generatedDocument(seed)
    const original = structuredClone(before)
    const ops: DocumentOp[] = [
      { type: 'setFields', id: before.id, fields: { data: {} }, unset: [], prior: {}, priorAbsent: ['data'] },
      { type: 'setFields', id: before.id, fields: { data: { slots: {} } }, unset: [], prior: { data: 'wrong' }, priorAbsent: [] },
    ]
    expect(() => applyOps(before, batch(before, ops))).toThrow(/op 1 \(setFields\).*node.*field "data" expected "wrong" but found/)
    expect(before).toEqual(original)
  })
})

test('diff and inversion carry a page body markdown source with the field', () => {
  const before = Document.parse({
    type: 'document',
    id: 'document',
    kind: 'page',
    children: [{ type: 'page', id: 'page', body: { html: '<p data-segnavia-id="p">Body</p>', markdown: 'Body' } }],
  })
  const after = Document.parse({
    ...before,
    children: [{ type: 'page', id: 'page', body: { html: '<p data-segnavia-id="p">Changed</p>' } }],
  })
  const afterPage = after.children[0]
  if (afterPage?.type !== 'page') throw new Error('test fixture has no page')
  const ops = diffDocuments(before, after)
  expect(ops).toMatchObject([{ type: 'setContent', id: 'page', field: 'body', content: afterPage.body }])
  const forward = batch(before, ops)
  expect(applyOps(before, forward)).toEqual(after)
  expect(applyOps(after, inverseBatch(forward, after))).toEqual(before)
})

test('inverts absent content, structural fields, and style through JSON', () => {
  const before = generatedDocumentOfKind('book', 9)
  const part = firstNode(before)
  const forward = batch(before, [
    { type: 'setContent', id: part.id, field: 'html', unset: true, prior: HEBREW },
    { type: 'setFields', id: part.id, fields: {}, unset: ['title'], prior: { title: 'Part' }, priorAbsent: [] },
    { type: 'setStyle', fields: {}, unset: ['css'], prior: { css: 'body{}' }, priorAbsent: [] },
  ])
  const after = applyOps(before, forward)
  const inverse = JSON.parse(JSON.stringify(inverseBatch(forward, after))) as DocumentBatch
  expect(applyOps(after, inverse)).toEqual(before)
})

describe('document operation refusals', () => {
  test('refuses setContent with both content and unset', () => {
    const before = generatedDocumentOfKind('deck', 1)
    const op = { type: 'setContent', id: firstNode(before).id, field: 'notes', content: 'next', unset: true, prior: 'old' }
    expect(() => applyOps(before, { base: fingerprintDocument(before), ops: [op] } as never)).toThrow(/keys "content" and "unset" cannot both be present/)
    expect(DocumentBatch.safeParse({ base: 'base', ops: [op] }).success).toBe(false)
  })

  test('refuses setContent with both prior and priorAbsent', () => {
    const before = generatedDocumentOfKind('deck', 1)
    const op = { type: 'setContent', id: firstNode(before).id, field: 'notes', content: 'next', prior: 'old', priorAbsent: true }
    expect(() => applyOps(before, { base: fingerprintDocument(before), ops: [op] } as never)).toThrow(/keys "prior" and "priorAbsent" cannot both be present/)
    expect(DocumentBatch.safeParse({ base: 'base', ops: [op] }).success).toBe(false)
  })

  test('refuses a stale base outside the targets with both fingerprints', () => {
    const before = generatedDocumentOfKind('deck', 1)
    const current = randomEdit(before, 1)
    expect(() => applyOps(current, { base: fingerprintDocument(before), ops: [] })).toThrow(
      new RegExp(`outside the batch's targets.*${fingerprintDocument(before)}.*${fingerprintDocument(current)}.*rebuild the batch`),
    )
  })

  test('refuses a stale prior by op index, node, field, expected, and found', () => {
    const before = generatedDocumentOfKind('deck', 1)
    const slide = firstNode(before)
    const op: DocumentOp = { type: 'setContent', id: slide.id, field: 'notes', content: 'next', prior: 'wrong' }
    const staleBase = `fnv1a64:${'0'.repeat(16)}`
    expect(() => applyOps(before, { base: staleBase, ops: [op] })).toThrow(/op 0 \(setContent\).*node.*field "notes" expected "wrong" but found/)
  })

  test('refuses a missing node with the operation and clearance', () => {
    const before = generatedDocument(1)
    const op: DocumentOp = { type: 'setFields', id: 'missing', fields: { title: 'x' }, unset: [], prior: { title: 'y' }, priorAbsent: [] }
    expect(() => applyOps(before, batch(before, [op]))).toThrow(/op 0 \(setFields\).*node "missing" is missing.*rebuild the batch/)
  })

  test('refuses a parent that cannot hold the inserted node type', () => {
    const before = generatedDocumentOfKind('deck', 1)
    const slide = firstNode(before)
    const op: DocumentOp = {
      type: 'insert',
      parent: { kind: 'node', id: slide.id },
      index: 0,
      node: { ...slide, id: 'inserted' } as never,
    }
    expect(() => applyOps(before, batch(before, [op]))).toThrow(/parent node.*cannot hold child nodes.*rebuild the batch/)
  })

  test('refuses an out-of-range index', () => {
    const before = generatedDocumentOfKind('deck', 2)
    const slide = firstNode(before)
    const op: DocumentOp = { type: 'insert', parent: { kind: 'node', id: before.id }, index: 9, node: { ...slide, id: 'inserted' } as never }
    expect(() => applyOps(before, batch(before, [op]))).toThrow(/index 9 is outside 0\.\.2.*rebuild the batch/)
  })

  test('is atomic when a later prior does not match', () => {
    const before = generatedDocumentOfKind('deck', 1)
    const original = structuredClone(before)
    const slide = firstNode(before)
    const ops: DocumentOp[] = [
      { type: 'setFields', id: before.id, fields: { title: 'Changed' }, unset: [], prior: { title: 'Deck' }, priorAbsent: [] },
      { type: 'setContent', id: slide.id, field: 'notes', content: 'changed', prior: 'wrong' },
    ]
    expect(() => applyOps(before, batch(before, ops))).toThrow(/op 1 \(setContent\).*does not|op 1 \(setContent\).*expected/)
    expect(before).toEqual(original)
  })

  test('refuses documents of different kinds', () => {
    expect(() => diffDocuments(generatedDocumentOfKind('deck', 1), generatedDocumentOfKind('page', 2))).toThrow(
      /document kinds .* differ.*compare documents of one kind/,
    )
  })

  test('refuses documents with different root ids', () => {
    const before = generatedDocumentOfKind('deck', 1)
    const after = Document.parse({ ...before, id: 'other-root' })
    expect(() => diffDocuments(before, after)).toThrow(/root ids "deck-1" and "other-root" differ.*share a root id/)
  })

  test('refuses setting a document kind', () => {
    const before = generatedDocumentOfKind('book', 1)
    const op = { type: 'setFields', id: before.id, fields: { kind: 'page' }, unset: [], prior: { kind: 'book' }, priorAbsent: [] }
    expect(() => applyOps(before, batch(before, [op as never]))).toThrow(/field "kind" is not settable by this operation/)
  })

  test('fingerprint, apply, and diff refuse an unparsed document', () => {
    const parsed = generatedDocumentOfKind('deck', 1)
    const unparsed = { type: 'document', kind: 'deck', title: 'Deck', children: [{ type: 'slide', content: { kind: 'html', html: HEBREW } }] } as never
    expect(() => fingerprintDocument(unparsed)).toThrow(/fingerprintDocument refused:.*parse it first/)
    expect(() => applyOps(unparsed, { base: fingerprintDocument(parsed), ops: [] })).toThrow(/applyOps refused:.*parse it first/)
    expect(() => diffDocuments(unparsed, parsed)).toThrow(/diffDocuments first document refused:.*parse it first/)
  })

  test('refuses a final result that Document.parse would change', () => {
    const before = generatedDocumentOfKind('deck', 1)
    const op: DocumentOp = {
      type: 'setFields',
      id: before.id,
      fields: {},
      unset: ['title'],
      prior: { title: 'Deck' },
      priorAbsent: [],
    }
    expect(() => applyOps(before, batch(before, [op]))).toThrow(/document batch refused: the result is not a valid document \(\[/)
  })
})

describe('document diff insertion ordering', () => {
  const book = (id: string, children: unknown[]) => Document.parse({ type: 'document', id, kind: 'book', title: 'Book', mode: 'continuous', children })
  const flow = { type: 'flow', id: 'n1', html: HEBREW }
  const section = { type: 'section', id: 'sb', title: 'Section', children: [flow] }

  test('inserts a new part and its descendants without aliasing the emitted nodes', () => {
    const before = book('book', [])
    const after = book('book', [{ type: 'part', id: 'pb', name: 'part', children: [section] }])
    expect(applyOps(before, batch(before, diffDocuments(before, after)))).toEqual(after)
  })

  test('moves an existing subtree under a newly inserted parent', () => {
    const before = book('book', [{ type: 'part', id: 'pa', name: 'old', children: [section] }])
    const after = book('book', [{ type: 'part', id: 'pb', name: 'new', children: [section] }])
    expect(applyOps(before, batch(before, diffDocuments(before, after)))).toEqual(after)
  })
})

describe('document diff sibling removal ordering', () => {
  const positions: Record<string, number> = { a: 0, b: 100, c: 200 }
  const item = (id: string) => ({ type: 'item' as const, id, kind: 'media' as const, address: `asset-${id}`, x: positions[id], y: 0, width: 100 })
  const board = (ids: string[]) =>
    Document.parse({
      type: 'document',
      id: 'board-1',
      kind: 'board',
      title: 'Board',
      settings: { dir: 'ltr' },
      children: ids.map(item),
    })

  test('removing the first of three siblings emits no moves', () => {
    const before = board(['a', 'b', 'c'])
    const after = board(['b', 'c'])
    const ops = diffDocuments(before, after)
    expect(ops).toMatchObject([{ type: 'remove', id: 'a' }])
    expect(ops).toHaveLength(1)
    expect(applyOps(before, batch(before, ops))).toEqual(after)
  })

  test('removing the middle of three siblings emits no moves', () => {
    const before = board(['a', 'b', 'c'])
    const after = board(['a', 'c'])
    const ops = diffDocuments(before, after)
    expect(ops).toMatchObject([{ type: 'remove', id: 'b' }])
    expect(ops).toHaveLength(1)
    expect(applyOps(before, batch(before, ops))).toEqual(after)
  })

  test('removing a sibling while reordering the survivors emits one move', () => {
    const before = board(['a', 'b', 'c'])
    const after = board(['c', 'a'])
    const ops = diffDocuments(before, after)
    expect(ops).toMatchObject([
      { type: 'move', id: 'c' },
      { type: 'remove', id: 'b' },
    ])
    expect(ops).toHaveLength(2)
    expect(applyOps(before, batch(before, ops))).toEqual(after)
  })
})

test('the schema-derived candidate generator covers every currently parseable modeled type', () => {
  const candidates = generatedCandidateDocuments(73)
  const covered = new Set(candidates.flatMap((document) => [...sampledNodeTypes(document)]))
  for (const type of Object.keys(DOCUMENT_NODE_MODEL)) {
    const sampleParses = candidates.some((document) => sampledNodeTypes(document).has(type))
    expect(covered.has(type), `${type} parseable=${sampleParses}`).toBe(sampleParses)
  }
  expect(covered).toEqual(
    new Set([
      'division',
      'part',
      'section',
      'flow',
      'page',
      'slide',
      'placed',
      'contents',
      'item',
      'label',
      'boardSection',
      'parentPage',
      'template',
      'noteSeries',
      'variable',
    ]),
  )
})

test('publishes document operation JSON Schemas', () => {
  expect(jsonSchemas().documentOp).toHaveProperty('anyOf')
  expect(jsonSchemas().documentBatch).toMatchObject({ type: 'object', required: ['base', 'ops'] })
})

describe('board document operations', () => {
  test('applies and inverts member and cell changes', () => {
    const before = generatedDocumentOfKind('board', 81)
    const section = before.children.find((node) => node.type === 'boardSection')
    const item = before.children.find((node) => node.type === 'item')
    if (!section || !item) throw new Error('generated board lacks its section or item')
    const ops: DocumentOp[] = [
      { type: 'setMember', section: section.id, item: item.id, from: null, to: { after: null } },
      { type: 'setCells', section: section.id, from: null, to: [{ id: item.id, row: 0, column: 0 }] },
    ]
    const after = applyOps(before, batch(before, ops))
    expect(applyOps(after, batch(after, invertOps(ops)))).toEqual(before)
  })

  test('a missing member anchor names its section and item', () => {
    const before = generatedDocumentOfKind('board', 82)
    const section = before.children.find((node) => node.type === 'boardSection')
    const item = before.children.find((node) => node.type === 'item')
    if (!section || !item) throw new Error('generated board lacks its section or item')
    const op: DocumentOp = { type: 'setMember', section: section.id, item: item.id, from: null, to: { after: 'missing-anchor' } }
    expect(() => applyOps(before, batch(before, [op]))).toThrow(new RegExp(`section "${section.id}" item "${item.id}".*missing-anchor`))
  })

  test('diffs board membership and cells without setting their fields wholesale', () => {
    const before = generatedDocumentOfKind('board', 83)
    const section = before.children.find((node) => node.type === 'boardSection')
    const item = before.children.find((node) => node.type === 'item')
    if (!section || !item) throw new Error('generated board lacks its section or item')
    const after = Document.parse({
      ...structuredClone(before),
      children: before.children.map((node) => (node.id === section.id ? { ...node, items: [item.id], cells: [{ id: item.id, row: 0, column: 0 }] } : node)),
    })
    const ops = diffDocuments(before, after)
    expect(ops.map((op) => op.type)).toEqual(['setMember', 'setCells'])
    expect(applyOps(before, batch(before, ops))).toEqual(after)
  })

  test('removes membership before its item so the inverse can rebase', () => {
    const empty = generatedDocumentOfKind('board', 84)
    const section = empty.children.find((node) => node.type === 'boardSection')
    const item = empty.children.find((node) => node.type === 'item')
    if (!section || !item) throw new Error('generated board lacks its section or item')
    const before = Document.parse({
      ...structuredClone(empty),
      children: empty.children.map((node) => (node.id === section.id ? { ...node, items: [item.id] } : node)),
    })
    const after = Document.parse({
      ...structuredClone(before),
      children: before.children.filter((node) => node.id !== item.id).map((node) => (node.id === section.id ? { ...node, items: [] } : node)),
    })
    const ops = diffDocuments(before, after)
    expect(ops.findIndex((op) => op.type === 'setMember')).toBeLessThan(ops.findIndex((op) => op.type === 'remove'))
    expect(rebaseOps(after, invertOps(ops))).toMatchObject({ document: before, conflicts: [] })
  })
})

test('fingerprints canonical parsed JSON independently of object key order', () => {
  const document = generatedDocument(2)
  const reordered = Object.fromEntries(Object.entries(document).reverse()) as typeof document
  expect(fingerprintDocument(reordered)).toBe(fingerprintDocument(document))
  expect(fingerprintDocument(document)).toMatch(/^fnv1a64:[0-9a-f]{16}$/)
})

const HEBREW = 'בְּרֵאשִׁ֖ית בָּרָ֣א'

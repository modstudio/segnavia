import { describe, expect, test } from 'bun:test'
import { applyOps } from './document-apply.ts'
import { diffDocuments } from './document-diff.ts'
import { fingerprintDocument } from './document-fingerprint.ts'
import { inverseBatch } from './document-invert.ts'
import type { DocumentBatch, DocumentOp } from './document-op.ts'
import { generatedDocument, generatedDocumentOfKind, randomEdit } from './document-op-test-helper.ts'

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

describe('document operation refusals', () => {
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
    expect(() => applyOps(before, batch(before, [op]))).toThrow(/index 9 is outside 0\.\.1.*rebuild the batch/)
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
    expect(() => applyOps(before, batch(before, [op]))).toThrow(/result|clear this refusal/)
  })
})

test('fingerprints canonical parsed JSON independently of object key order', () => {
  const document = generatedDocument(2)
  const reordered = Object.fromEntries(Object.entries(document).reverse()) as typeof document
  expect(fingerprintDocument(reordered)).toBe(fingerprintDocument(document))
  expect(fingerprintDocument(document)).toMatch(/^fnv1a64:[0-9a-f]{16}$/)
})

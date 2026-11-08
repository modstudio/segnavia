import { describe, expect, test } from 'bun:test'
import { Document } from './document.ts'
import type { DocumentOp } from './document-op.ts'
import { rebaseOps } from './document-rebase.ts'

const board = () =>
  Document.parse({
    type: 'document',
    id: 'board',
    kind: 'board',
    title: 'Board',
    settings: { dir: 'ltr' },
    children: [
      { type: 'item', id: 'a', kind: 'page', address: 'a', x: 0, y: 0, width: 10 },
      { type: 'item', id: 'b', kind: 'page', address: 'b', x: 0, y: 0, width: 10 },
      { type: 'boardSection', id: 'section', title: 'Section', rectangle: { x: 0, y: 0, width: 20, height: 20 }, items: [] },
    ],
  })

describe('rebaseOps', () => {
  test('keeps two writers moving different items into one section', () => {
    const first: DocumentOp = { type: 'setMember', section: 'section', item: 'a', from: null, to: { after: null } }
    const second: DocumentOp = { type: 'setMember', section: 'section', item: 'b', from: null, to: { after: null } }
    const afterFirst = rebaseOps(board(), [first]).document
    const result = rebaseOps(afterFirst, [second])
    expect(result.conflicts).toEqual([])
    expect(result.document.children.find((node) => node.id === 'section')).toMatchObject({ items: ['b', 'a'] })
  })

  test('conflicts when two writers move the same item', () => {
    const first: DocumentOp = { type: 'setMember', section: 'section', item: 'a', from: null, to: { after: null } }
    const afterFirst = rebaseOps(board(), [first]).document
    const result = rebaseOps(afterFirst, [first])
    expect(result.applied).toEqual([])
    expect(result.conflicts).toEqual([first])
  })

  test('conflicts when another writer changed the same field', () => {
    const document = board()
    const remote: DocumentOp = { type: 'setFields', id: 'a', fields: { x: 4 }, unset: [], prior: { x: 0 }, priorAbsent: [] }
    const local: DocumentOp = { type: 'setFields', id: 'a', fields: { x: 8 }, unset: [], prior: { x: 0 }, priorAbsent: [] }
    const result = rebaseOps(rebaseOps(document, [remote]).document, [local])
    expect(result.conflicts).toEqual([local])
  })

  test('conflicts when its target node was removed', () => {
    const document = board()
    const item = document.children.find((node) => node.id === 'a')
    if (!item) throw new Error('fixture item is missing')
    const removed = rebaseOps(document, [{ type: 'remove', id: 'a', prior: item, parent: { kind: 'node', id: 'board' }, index: 0 }]).document
    const op: DocumentOp = { type: 'setFields', id: 'a', fields: { x: 8 }, unset: [], prior: { x: 0 }, priorAbsent: [] }
    expect(rebaseOps(removed, [op]).conflicts).toEqual([op])
  })
})

import { describe, expect, test } from 'bun:test'
import type { Board } from './board.ts'
import { resolveEntity, resolveItem, resolveSection } from './board-command-resolvers.ts'

const board: Board = {
  title: 'B',
  direction: 'ltr',
  items: [
    { id: 'a', kind: 'page', address: 'same', x: 0, y: 0, width: 100 },
    { id: 'b', kind: 'page', address: 'same', x: 0, y: 0, width: 100 },
  ],
  labels: [{ id: 'l', text: 'Label', x: 0, y: 0 }],
  sections: [
    { id: 's', title: 'Same', rectangle: { x: 0, y: 0, width: 100, height: 100 }, items: [] },
    { id: 't', title: 'Same', rectangle: { x: 0, y: 0, width: 100, height: 100 }, items: [] },
  ],
}

describe('board command resolvers', () => {
  test('resolves globally unique entity ids without a kind tag', () =>
    expect(resolveEntity(board, { id: 'l' })).toEqual({ kind: 'label', value: board.labels[0] }))

  test('names every id in ambiguous item addresses and section titles', () => {
    expect(() => resolveItem(board, { address: 'same' })).toThrow('matches a, b')
    expect(() => resolveSection(board, { title: 'Same' })).toThrow('matches s, t')
  })
})

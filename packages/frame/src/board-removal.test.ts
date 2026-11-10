import { expect, test } from 'bun:test'
import type { Board } from '@segnavia/format'
import { boardRemoval } from './board-removal.ts'

const board: Board = {
  title: 'Board',
  direction: 'ltr',
  items: [
    { id: 'one', kind: 'page', address: 'one', x: 0, y: 0, width: 100 },
    { id: 'two', kind: 'page', address: 'two', x: 0, y: 0, width: 100 },
  ],
  labels: [{ id: 'label', text: 'Label', x: 0, y: 0 }],
  sections: [{ id: 'section', title: 'Section', rectangle: { x: 0, y: 0, width: 100, height: 100 }, items: ['one', 'two'] }],
}

test('removes mixed entities in one command list and selects released members', () => {
  expect(boardRemoval(board, ['section', 'label', 'two'])).toEqual({
    commands: [
      { type: 'section-remove', section: { id: 'section' }, members: 'release' },
      { type: 'label-remove', labels: [{ id: 'label' }] },
      { type: 'item-remove', items: [{ id: 'two' }] },
    ],
    removed: ['section', 'label', 'two'],
    selection: ['one'],
  })
})

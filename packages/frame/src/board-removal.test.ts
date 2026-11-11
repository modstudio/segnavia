import { expect, test } from 'bun:test'
import type { Board } from '@segnavia/format'
import { boardRemoval, removeBoardEntities } from './board-removal.ts'

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

test('removes mixed entities, keeps prior selection and selects released members', () => {
  expect(boardRemoval(board, ['section', 'label', 'two'], ['section', 'label', 'two', 'kept'])).toEqual({
    commands: [
      { type: 'section-remove', section: { id: 'section' }, members: 'release' },
      { type: 'label-remove', labels: [{ id: 'label' }] },
      { type: 'item-remove', items: [{ id: 'two' }] },
    ],
    removed: ['section', 'label', 'two'],
    selection: ['kept', 'one'],
  })
})

test('keeps selected ids outside a subset removal', () => {
  expect(boardRemoval(board, ['two'], ['two', 'label'])?.selection).toEqual(['label'])
})

test('leaves selection and focus untouched when removal is refused', () => {
  const effects: string[] = []
  removeBoardEntities(board, ['two'], { selection: ['two', 'label'], focus: () => effects.push('focus') }, () => false)
  expect(effects).toEqual([])
})

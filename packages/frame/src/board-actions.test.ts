import { describe, expect, test } from 'bun:test'
import { actionsForKind, type BoardItemAction } from './board-actions.ts'

describe('actionsForKind', () => {
  test('keeps universal actions and actions whose kinds include the item', () => {
    const open: BoardItemAction = { id: 'open', label: 'Open' }
    const actions: BoardItemAction[] = [open, { id: 'download', label: 'Download', kinds: ['deck', 'page'] }]
    expect(actionsForKind(actions, 'deck')).toEqual(actions)
    expect(actionsForKind(actions, 'image')).toEqual([open])
  })
})

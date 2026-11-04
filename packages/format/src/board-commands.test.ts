import { describe, expect, test } from 'bun:test'
import { BoardCommand, BoardTarget } from './board-commands.ts'

describe('BoardCommand', () => {
  test('parses each item verb and arrange as a discriminated command', () => {
    const commands = [
      { type: 'item-add', id: 'new', kind: 'page', address: 'pages/new', target: { free: true } },
      { type: 'item-remove', items: [{ id: 'a' }] },
      { type: 'item-move', items: [{ address: 'pages/a' }], target: { at: { x: 1, y: 2 } } },
      { type: 'item-resize', item: { id: 'a' }, width: 20 },
      { type: 'arrange', section: { title: 'Pages' }, columns: 2 },
    ]
    for (const command of commands) expect(BoardCommand.safeParse(command).success).toBe(true)
  })

  test('parses all four target forms and refuses two ordering anchors', () => {
    const targets = [{ section: { id: 's' }, after: { id: 'a' } }, { beside: { title: 'Pages' }, side: 'start' }, { free: true }, { at: { x: 1, y: 2 } }]
    for (const target of targets) expect(BoardTarget.safeParse(target).success).toBe(true)
    expect(BoardTarget.safeParse({ section: { id: 's' }, after: { id: 'a' }, before: { id: 'b' } }).success).toBe(false)
  })
})

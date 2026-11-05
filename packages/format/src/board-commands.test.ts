import { describe, expect, test } from 'bun:test'
import { BoardCommand, BoardTarget, PlacementTarget } from './board-commands.ts'
import { jsonSchemas } from './json-schemas.ts'

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

  test('publishes the command input schema', () => expect(jsonSchemas().boardCommand).toHaveProperty('oneOf'))

  test('parses section, label and board verbs with their settled shapes', () => {
    const commands = [
      { type: 'section-add', title: 'New', items: [{ id: 'a' }], target: { free: true } },
      { type: 'section-remove', section: { id: 's' }, members: 'release' },
      { type: 'section-set', section: { title: 'Pages' }, layout: 'manual' },
      { type: 'label-add', text: 'Note', target: { beside: { id: 'a' }, side: 'above' } },
      { type: 'label-remove', labels: [{ id: 'note' }] },
      { type: 'label-set', label: { id: 'note' }, text: 'Changed' },
      { type: 'board-set', direction: 'rtl' },
    ]
    for (const command of commands) expect(BoardCommand.safeParse(command).success).toBe(true)
    expect(PlacementTarget.safeParse({ section: { id: 's' } }).success).toBe(false)
  })

  test('refuses empty set commands at the schema edge', () => {
    for (const command of [{ type: 'section-set', section: { id: 's' } }, { type: 'label-set', label: { id: 'l' } }, { type: 'board-set' }])
      expect(BoardCommand.safeParse(command).success).toBe(false)
  })
})

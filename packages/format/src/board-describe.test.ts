import { describe, expect, test } from 'bun:test'
import type { Board } from './board.ts'
import { describeBoard } from './board-describe.ts'
import type { ComputedBoardShapes } from './board-shapes.ts'

function fixture(direction: Board['direction'] = 'ltr'): { board: Board; shapes: ComputedBoardShapes } {
  return {
    board: {
      title: 'Plan',
      direction,
      items: [
        { id: 'first', address: 'deck:first', kind: 'deck', x: 10, y: 30, width: 20 },
        { id: 'second', address: 'page:second', kind: 'page', x: 35, y: 30, width: 10 },
        { id: 'loose', address: 'media:loose', kind: 'media', x: 100, y: 10, width: 20 },
        { id: 'last', address: 'book:last', kind: 'book', x: 205, y: 30, width: 20 },
      ],
      labels: [{ id: 'note', text: 'Over loose', x: 110, y: 15 }],
      sections: [
        { id: 'main', title: 'Main', rectangle: { x: 0, y: 0, width: 60, height: 70 }, items: ['second', 'first'], layout: 'auto' },
        { id: 'later', title: 'Later', rectangle: { x: 200, y: 0, width: 40, height: 70 }, items: ['last'], layout: 'manual' },
      ],
    },
    shapes: {
      shapes: {
        items: {
          first: { width: 2, height: 1 },
          second: { width: 1, height: 1 },
          loose: { width: 2, height: 1 },
          last: { width: 1, height: 1 },
        },
        labels: { note: { width: 20, height: 10 } },
      },
      provisional: ['loose'],
      estimated: ['note'],
    },
  }
}

describe('describeBoard', () => {
  test('keeps board section and member order and reports auto cells', () => {
    const { board, shapes } = fixture()
    const description = describeBoard(board, shapes, { detail: 'full' })

    expect(description.sections.map((section) => section.id)).toEqual(['main', 'later'])
    expect(description.sections[0]?.members.map((member) => member.id)).toEqual(['second', 'first'])
    expect(description.sections[0]?.members.every((member) => member.cell !== undefined)).toBe(true)
    expect(description.sections[1]?.members[0]?.cell).toBeUndefined()
  })

  test('reports positive-area overlaps except a member with its section', () => {
    const { board, shapes } = fixture()
    const overlaps = describeBoard(board, shapes).overlaps

    expect(overlaps).toContainEqual({ a: { kind: 'item', id: 'loose' }, b: { kind: 'label', id: 'note' } })
    expect(overlaps.some((overlap) => overlap.a.id === 'main' && overlap.b.id === 'first')).toBe(false)
    expect(overlaps.some((overlap) => overlap.a.id === 'main' && overlap.b.id === 'second')).toBe(false)
  })

  test('narrows entities by region and by section id or unique title', () => {
    const { board, shapes } = fixture()
    const region = describeBoard(board, shapes, { region: { x: 95, y: 5, width: 40, height: 30 } })
    expect(region.sections).toEqual([])
    expect(region.items.map((item) => item.id)).toEqual(['loose'])
    expect(region.labels.map((label) => label.id)).toEqual(['note'])

    const section = describeBoard(board, shapes, { section: 'Main' })
    expect(section.sections.map((entry) => entry.id)).toEqual(['main'])
    expect(section.items).toEqual([])
    expect(section.labels).toEqual([])
  })

  test('omits boxes in concise output', () => {
    const { board, shapes } = fixture()
    const description = describeBoard(board, shapes)

    expect(description.sections[0]).not.toHaveProperty('box')
    expect(description.items[0]).not.toHaveProperty('box')
    expect(description.labels[0]).not.toHaveProperty('box')
  })

  test('pages every section with its members, then loose items and labels exactly once', () => {
    const { board, shapes } = fixture()
    const ids: string[] = []
    let cursor: string | undefined
    do {
      const page = describeBoard(board, shapes, { cursor, limit: 1 })
      ids.push(...page.sections.flatMap((section) => [section.id, ...section.members.map((member) => member.id)]))
      ids.push(...page.items.map((item) => item.id), ...page.labels.map((label) => label.id))
      cursor = page.next
    } while (cursor)

    expect(ids).toEqual(['main', 'second', 'first', 'later', 'last', 'loose', 'note'])
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('reports the board resolved direction without reordering', () => {
    const { board, shapes } = fixture('rtl')
    const description = describeBoard(board, shapes)

    expect(description.direction).toBe('rtl')
    expect(description.sections.map((section) => section.id)).toEqual(['main', 'later'])
  })
})

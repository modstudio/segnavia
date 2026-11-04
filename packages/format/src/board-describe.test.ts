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

  test('reports overlaps with unselected entities when section and region filters are combined', () => {
    const { board, shapes } = fixture()
    const loose = board.items.find((item) => item.id === 'loose')
    if (!loose) throw new Error('fixture has no loose item')
    loose.x = 38
    loose.y = 32

    const description = describeBoard(board, shapes, { section: 'main', region: { x: 0, y: 0, width: 250, height: 80 } })

    expect(description.overlaps).toContainEqual({ a: { kind: 'item', id: 'second' }, b: { kind: 'item', id: 'loose' } })
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
    const overlaps: Array<{ page: string[]; overlap: ReturnType<typeof describeBoard>['overlaps'][number] }> = []
    const confidence: Array<{ page: string[]; provisional: string[]; estimated: string[] }> = []
    let cursor: string | undefined
    do {
      const page = describeBoard(board, shapes, { cursor, limit: 1 })
      const pageIds = [
        ...page.sections.flatMap((section) => [section.id, ...section.members.map((member) => member.id)]),
        ...page.items.map((item) => item.id),
        ...page.labels.map((label) => label.id),
      ]
      ids.push(...pageIds)
      overlaps.push(...page.overlaps.map((overlap) => ({ page: pageIds, overlap })))
      confidence.push({ page: pageIds, provisional: page.provisional, estimated: page.estimated })
      cursor = page.next
    } while (cursor)

    expect(ids).toEqual(['main', 'second', 'first', 'later', 'last', 'loose', 'note'])
    expect(new Set(ids).size).toBe(ids.length)
    expect(overlaps).toEqual([{ page: ['loose'], overlap: { a: { kind: 'item', id: 'loose' }, b: { kind: 'label', id: 'note' } } }])
    expect(confidence).toEqual([
      { page: ['main', 'second', 'first'], provisional: [], estimated: [] },
      { page: ['later', 'last'], provisional: [], estimated: [] },
      { page: ['loose'], provisional: ['loose'], estimated: [] },
      { page: ['note'], provisional: [], estimated: ['note'] },
    ])
  })

  test('reports direction-sensitive auto-section cells', () => {
    const ltr = fixture('ltr')
    const rtl = fixture('rtl')
    const ltrMembers = describeBoard(ltr.board, ltr.shapes, { detail: 'full' }).sections[0]?.members
    const rtlMembers = describeBoard(rtl.board, rtl.shapes, { detail: 'full' }).sections[0]?.members

    expect(ltrMembers).toEqual([
      { id: 'second', address: 'page:second', kind: 'page', cell: { row: 0, column: 1 } },
      { id: 'first', address: 'deck:first', kind: 'deck', cell: { row: 0, column: 0 } },
    ])
    expect(rtlMembers).toEqual([
      { id: 'second', address: 'page:second', kind: 'page', cell: { row: 0, column: 0 } },
      { id: 'first', address: 'deck:first', kind: 'deck', cell: { row: 0, column: 1 } },
    ])
  })
})

import { describe, expect, test } from 'bun:test'
import type { Board } from './board.ts'
import { deriveSectionCells, gridDropTarget, insertIntoGrid, layoutSection, removeFromGrid } from './board-section-grid.ts'
import { SECTION_GAP, SECTION_PADDING, SECTION_TITLE_ROOM } from './board-sections.ts'

const shapes = {
  items: {
    wide: { width: 200, height: 100 },
    tall: { width: 100, height: 300 },
    small: { width: 100, height: 100 },
    extra: { width: 100, height: 100 },
    loose: { width: 100, height: 100 },
  },
  labels: {},
}

function fixture(direction: Board['direction'] = 'ltr'): Board {
  return {
    title: 'Grid',
    direction,
    items: [
      { id: 'wide', kind: 'deck', address: 'wide', x: 30, y: 40, width: 200 },
      { id: 'tall', kind: 'page', address: 'tall', x: 260, y: 50, width: 100 },
      { id: 'small', kind: 'deck', address: 'small', x: 30, y: 380, width: 100 },
      { id: 'extra', kind: 'deck', address: 'extra', x: 500, y: 500, width: 100 },
      { id: 'loose', kind: 'deck', address: 'loose', x: 600, y: 500, width: 100 },
    ],
    labels: [],
    sections: [
      {
        id: 'grid',
        title: 'Grid',
        rectangle: { x: 0, y: 0, width: 10, height: 10 },
        items: ['wide', 'tall', 'small'],
        cells: [
          { id: 'wide', row: 0, column: 0 },
          { id: 'tall', row: 0, column: 1 },
          { id: 'small', row: 1, column: 0 },
        ],
      },
    ],
  }
}

describe('auto section grid geometry', () => {
  test('uses the widest column item and tallest row item', () => {
    const laidOut = layoutSection(fixture(), shapes, 'grid')
    expect(laidOut.items.slice(0, 3).map(({ x, y }) => ({ x, y }))).toEqual([
      { x: SECTION_PADDING, y: SECTION_PADDING + SECTION_TITLE_ROOM },
      { x: SECTION_PADDING + 200 + SECTION_GAP, y: SECTION_PADDING + SECTION_TITLE_ROOM },
      { x: SECTION_PADDING, y: SECTION_PADDING + SECTION_TITLE_ROOM + 300 + SECTION_GAP },
    ])
    expect(laidOut.sections[0]?.rectangle).toMatchObject({
      width: 200 + SECTION_GAP + 100 + SECTION_PADDING * 2,
      height: 300 + SECTION_GAP + 100 + SECTION_PADDING * 2 + SECTION_TITLE_ROOM,
    })
  })

  test('derives cells from overlapping vertical bounds and mirrors reading order', () => {
    const value = fixture()
    const section = value.sections[0]
    if (!section) throw new Error('fixture section is missing')
    const withoutCells = { ...value, sections: [{ ...section, cells: undefined }] }
    expect(deriveSectionCells(withoutCells, shapes, 'grid')).toEqual([
      { id: 'wide', row: 0, column: 0 },
      { id: 'tall', row: 0, column: 1 },
      { id: 'small', row: 1, column: 0 },
    ])
    const aligned = { ...withoutCells, direction: 'rtl' as const, items: withoutCells.items.map((item) => (item.id === 'tall' ? { ...item, y: 40 } : item)) }
    expect(deriveSectionCells(aligned, shapes, 'grid').map((cell) => cell.id)).toEqual(['tall', 'wide', 'small'])
  })

  test('lays out right-to-left columns from the right', () => {
    const laidOut = layoutSection(fixture('rtl'), shapes, 'grid')
    expect(laidOut.items.find((item) => item.id === 'wide')?.x).toBe(SECTION_PADDING + 100 + SECTION_GAP)
    expect(laidOut.items.find((item) => item.id === 'tall')?.x).toBe(SECTION_PADDING)
  })

  test('does not restore a stale cell after membership changes', () => {
    const value = fixture()
    const section = value.sections[0]
    if (!section) throw new Error('fixture section is missing')
    const withoutTall = { ...value, sections: [{ ...section, items: section.items.filter((id) => id !== 'tall') }] }
    const laidOut = layoutSection(withoutTall, shapes, 'grid')
    expect(laidOut.sections[0]?.items).toEqual(['wide', 'small'])
    expect(laidOut.sections[0]?.cells?.some((cell) => cell.id === 'tall')).toBe(false)
    expect(laidOut.items.find((item) => item.id === 'tall')).toMatchObject({ x: 260, y: 50 })
  })

  test('maps a physical right-edge drop to before in right-to-left reading order', () => {
    const laidOut = layoutSection(fixture('rtl'), shapes, 'grid')
    const wide = laidOut.items.find((item) => item.id === 'wide')
    if (!wide) throw new Error('fixture item is missing')
    expect(gridDropTarget(laidOut, shapes, 'grid', { x: wide.x + wide.width - 1, y: wide.y + 50 })).toEqual({ row: 0, column: 0, axis: 'row' })
  })

  test('inserts on all four item edges and in track gaps', () => {
    const laidOut = layoutSection(fixture(), shapes, 'grid')
    const item = laidOut.items[0]
    if (!item) throw new Error('fixture item is missing')
    expect(gridDropTarget(laidOut, shapes, 'grid', { x: item.x + 1, y: item.y + 50 })).toEqual({ row: 0, column: 0, axis: 'row' })
    expect(gridDropTarget(laidOut, shapes, 'grid', { x: item.x + item.width - 1, y: item.y + 50 })).toEqual({ row: 0, column: 1, axis: 'row' })
    expect(gridDropTarget(laidOut, shapes, 'grid', { x: item.x + 100, y: item.y + 1 })).toEqual({ row: 0, column: 0, axis: 'column' })
    expect(gridDropTarget(laidOut, shapes, 'grid', { x: item.x + 100, y: item.y + 99 })).toEqual({ row: 1, column: 0, axis: 'column' })
    expect(gridDropTarget(laidOut, shapes, 'grid', { x: item.x + item.width + SECTION_GAP / 2, y: item.y + 50 })).toEqual({ row: 0, column: 1, axis: 'row' })
  })
})

describe('auto section grid edits', () => {
  test('inserts several ids together and shifts only the target row', () => {
    const inserted = insertIntoGrid(fixture(), shapes, 'grid', ['extra', 'small'], { row: 0, column: 1, axis: 'row' })
    expect(inserted.sections[0]?.cells).toEqual([
      { id: 'wide', row: 0, column: 0 },
      { id: 'extra', row: 0, column: 1 },
      { id: 'small', row: 0, column: 2 },
      { id: 'tall', row: 0, column: 3 },
    ])
  })

  test('column insertion leaves cells in other rows alone', () => {
    const inserted = insertIntoGrid(fixture(), shapes, 'grid', ['extra'], { row: 1, column: 1, axis: 'column' })
    expect(inserted.sections[0]?.cells).toContainEqual({ id: 'wide', row: 0, column: 0 })
    expect(inserted.sections[0]?.cells).toContainEqual({ id: 'tall', row: 0, column: 1 })
    expect(inserted.sections[0]?.cells).toContainEqual({ id: 'small', row: 1, column: 0 })
    expect(inserted.sections[0]?.cells).toContainEqual({ id: 'extra', row: 1, column: 1 })
  })

  test('fills a vacant cell without shifting a later cell in that row', () => {
    const withHole = insertIntoGrid(fixture(), shapes, 'grid', ['extra'], { row: 2, column: 1, axis: 'column' })
    const laidOut = layoutSection(withHole, shapes, 'grid')
    const extra = laidOut.items.find((item) => item.id === 'extra')
    if (!extra) throw new Error('fixture item is missing')
    const target = gridDropTarget(laidOut, shapes, 'grid', { x: SECTION_PADDING + 50, y: extra.y + 50 })
    expect(target).toEqual({ row: 2, column: 0, axis: 'row' })
    const filled = target ? insertIntoGrid(laidOut, shapes, 'grid', ['loose'], target) : laidOut
    expect(filled.sections[0]?.cells).toContainEqual({ id: 'loose', row: 2, column: 0 })
    expect(filled.sections[0]?.cells).toContainEqual({ id: 'extra', row: 2, column: 1 })
  })

  test('closes a row gap and renumbers after a column empties', () => {
    const rowClosed = removeFromGrid(fixture(), shapes, ['wide'])
    expect(rowClosed.sections[0]?.cells).toContainEqual({ id: 'tall', row: 0, column: 0 })
    const columnClosed = removeFromGrid(fixture(), shapes, ['tall'])
    expect(columnClosed.sections[0]?.cells).toEqual([
      { id: 'wide', row: 0, column: 0 },
      { id: 'small', row: 1, column: 0 },
    ])
  })

  test('removes an empty column from a grid containing vacant cells', () => {
    const withHole = insertIntoGrid(fixture(), shapes, 'grid', ['extra'], { row: 2, column: 1, axis: 'column' })
    const withoutSecondColumn = removeFromGrid(withHole, shapes, ['tall', 'extra'])
    expect(withoutSecondColumn.sections[0]?.cells).toEqual([
      { id: 'wide', row: 0, column: 0 },
      { id: 'small', row: 1, column: 0 },
    ])
  })

  test('leaves a manual section untouched by layout', () => {
    const value = fixture()
    const section = value.sections[0]
    if (!section) throw new Error('fixture section is missing')
    value.sections[0] = { ...section, layout: 'manual' }
    expect(layoutSection(value, shapes, 'grid')).toBe(value)
  })

  function singleRow() {
    const value = fixture()
    const section = value.sections[0]
    if (!section) throw new Error('fixture section is missing')
    return { ...value, sections: [{ ...section, items: ['wide', 'tall', 'small'], cells: section.items.map((id, column) => ({ id, row: 0, column })) }] }
  }

  test('reorders forwards within a row in post-removal coordinates', () => {
    expect(insertIntoGrid(singleRow(), shapes, 'grid', ['wide'], { row: 0, column: 2, axis: 'row' }).sections[0]?.items).toEqual(['tall', 'wide', 'small'])
  })

  test('reorders backwards within a row in post-removal coordinates', () => {
    expect(insertIntoGrid(singleRow(), shapes, 'grid', ['small'], { row: 0, column: 1, axis: 'row' }).sections[0]?.items).toEqual(['wide', 'small', 'tall'])
  })

  test('a drop on a member own neighboring edge preserves row order', () => {
    expect(insertIntoGrid(singleRow(), shapes, 'grid', ['wide'], { row: 0, column: 1, axis: 'row' }).sections[0]?.items).toEqual(['wide', 'tall', 'small'])
    expect(insertIntoGrid(singleRow(), shapes, 'grid', ['wide'], { row: 0, column: 0, axis: 'column' }).sections[0]?.cells).toEqual([
      { id: 'wide', row: 0, column: 0 },
      { id: 'tall', row: 0, column: 1 },
      { id: 'small', row: 0, column: 2 },
    ])
  })

  test('translates column targets after removing a member from its original cell', () => {
    const value = fixture()
    const section = value.sections[0]
    if (!section) throw new Error('fixture section is missing')
    const column = { ...value, sections: [{ ...section, items: ['wide', 'tall', 'small'], cells: section.items.map((id, row) => ({ id, row, column: 0 })) }] }
    expect(insertIntoGrid(column, shapes, 'grid', ['wide'], { row: 2, column: 0, axis: 'column' }).sections[0]?.items).toEqual(['tall', 'wide', 'small'])
  })

  test('derives two rows before removing from a section without stored cells', () => {
    const value = fixture()
    const section = value.sections[0]
    if (!section) throw new Error('fixture section is missing')
    const withoutCells = { ...value, sections: [{ ...section, cells: undefined }] }
    expect(removeFromGrid(withoutCells, shapes, ['wide']).sections[0]?.cells).toEqual([
      { id: 'tall', row: 0, column: 0 },
      { id: 'small', row: 1, column: 0 },
    ])
  })
})

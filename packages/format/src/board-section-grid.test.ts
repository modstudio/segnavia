import { describe, expect, test } from 'bun:test'
import type { Board } from './board.ts'
import { deriveSectionRows, gridDropTarget, insertIntoGrid, layoutSection, removeFromGrid } from './board-section-grid.ts'
import { SECTION_GAP, SECTION_PADDING, SECTION_TITLE_ROOM } from './board-sections.ts'

const shapes = {
  items: {
    wide: { width: 200, height: 100 },
    tall: { width: 100, height: 300 },
    small: { width: 100, height: 100 },
    extra: { width: 100, height: 100 },
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
    ],
    labels: [],
    sections: [{ id: 'grid', title: 'Grid', rectangle: { x: 0, y: 0, width: 10, height: 10 }, items: ['wide', 'tall', 'small'], rows: [['wide', 'tall'], ['small']] }],
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
    expect(laidOut.sections[0]?.rectangle).toMatchObject({ width: 200 + SECTION_GAP + 100 + SECTION_PADDING * 2, height: 300 + SECTION_GAP + 100 + SECTION_PADDING * 2 + SECTION_TITLE_ROOM })
  })

  test('derives rows from overlapping vertical bounds and mirrors reading order', () => {
    const withoutRows = { ...fixture(), sections: [{ ...fixture().sections[0]!, rows: undefined }] }
    expect(deriveSectionRows(withoutRows, shapes, 'grid')).toEqual([['wide', 'tall'], ['small']])
    expect(deriveSectionRows({ ...withoutRows, direction: 'rtl' }, shapes, 'grid')).toEqual([['tall', 'wide'], ['small']])
  })

  test('lays out right-to-left rows from the right', () => {
    const laidOut = layoutSection(fixture('rtl'), shapes, 'grid')
    expect(laidOut.items.find((item) => item.id === 'wide')?.x).toBe(SECTION_PADDING + 100 + SECTION_GAP)
    expect(laidOut.items.find((item) => item.id === 'tall')?.x).toBe(SECTION_PADDING)
  })

  test('inserts on all four item edges and in track gaps', () => {
    const laidOut = layoutSection(fixture(), shapes, 'grid')
    const item = laidOut.items[0]!
    expect(gridDropTarget(laidOut, shapes, 'grid', { x: item.x + 1, y: item.y + 50 })).toEqual({ row: 0, column: 0, axis: 'row' })
    expect(gridDropTarget(laidOut, shapes, 'grid', { x: item.x + item.width - 1, y: item.y + 50 })).toEqual({ row: 0, column: 1, axis: 'row' })
    expect(gridDropTarget(laidOut, shapes, 'grid', { x: item.x + 100, y: item.y + 1 })).toEqual({ row: 0, column: 0, axis: 'column' })
    expect(gridDropTarget(laidOut, shapes, 'grid', { x: item.x + 100, y: item.y + 99 })).toEqual({ row: 1, column: 0, axis: 'column' })
    expect(gridDropTarget(laidOut, shapes, 'grid', { x: item.x + item.width + SECTION_GAP / 2, y: item.y + 50 })).toEqual({ row: 0, column: 1, axis: 'row' })
  })
})

describe('auto section grid edits', () => {
  test('inserts several ids together in selection order and shifts only one row', () => {
    const inserted = insertIntoGrid(fixture(), 'grid', ['extra', 'small'], { row: 0, column: 1, axis: 'row' })
    expect(inserted.sections[0]?.rows).toEqual([['wide', 'extra', 'small', 'tall']])
  })

  test('column insertion into a ragged grid creates null cells and shifts only that column', () => {
    const inserted = insertIntoGrid(fixture(), 'grid', ['extra'], { row: 1, column: 1, axis: 'column' })
    expect(inserted.sections[0]?.rows).toEqual([['wide', 'tall'], ['small', 'extra']])
    const deeper = insertIntoGrid(fixture(), 'grid', ['extra'], { row: 2, column: 1, axis: 'column' })
    expect(deeper.sections[0]?.rows).toEqual([['wide', 'tall'], ['small', null], [null, 'extra']])
  })

  test('closes row gaps, trims trailing nulls, and removes all-null columns', () => {
    const value = fixture()
    value.sections[0] = { ...value.sections[0]!, items: ['wide', 'small', 'tall'], rows: [['wide', null, 'small'], [null, 'tall']] }
    expect(removeFromGrid(value, ['small']).sections[0]?.rows).toEqual([['wide'], [null, 'tall']])
    expect(removeFromGrid(value, ['wide', 'small']).sections[0]?.rows).toEqual([['tall']])
  })

  test('leaves a manual section untouched by layout', () => {
    const value = fixture()
    value.sections[0] = { ...value.sections[0]!, layout: 'manual' }
    expect(layoutSection(value, shapes, 'grid')).toBe(value)
  })
})

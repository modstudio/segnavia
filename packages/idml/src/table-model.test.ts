import { describe, expect, test } from 'bun:test'
import { tableGrid } from './table-model.ts'
import type { IdmlTextNode } from './types.ts'

const child = (name: string, attributes: Record<string, string>, location = `Story.xml#${name}`): IdmlTextNode => ({
  name,
  attributes,
  children: [],
  location,
})

function table(cells: IdmlTextNode[], attributes: Record<string, string> = {}): IdmlTextNode {
  return {
    name: 'Table',
    attributes: { HeaderRowCount: '1', BodyRowCount: '1', FooterRowCount: '1', ...attributes },
    children: [child('Column', { SingleColumnWidth: '42' }), child('Column', { SingleColumnWidth: '58' }), ...cells,
      child('Row', { SingleRowHeight: '12', AutoGrow: 'false' }), child('Row', { SingleRowHeight: '13' }), child('Row', {})],
    location: 'Stories/Story.xml#table',
  }
}

test('builds regions, dimensions, fixed heights, direction, and document-order-independent cells', () => {
  const grid = tableGrid(table([
    child('Cell', { Name: '1:0' }), child('Cell', { Name: '0:0' }),
    child('Cell', { Name: '0:1', ColumnSpan: '2' }), child('Cell', { Name: '0:2' }), child('Cell', { Name: '1:2' }),
  ], { TableDirection: 'RightToLeft' }))
  expect(grid.direction).toBe('rtl')
  expect(grid.columns).toEqual([42, 58])
  expect(grid.rows).toEqual([
    { region: 'header', height: 12, fixed: true }, { region: 'body', height: 13, fixed: false }, { region: 'footer', fixed: false },
  ])
  expect(grid.cells.map(({ row, column, rowSpan, columnSpan }) => ({ row, column, rowSpan, columnSpan }))).toEqual([
    { row: 0, column: 0, rowSpan: 1, columnSpan: 1 }, { row: 0, column: 1, rowSpan: 1, columnSpan: 1 },
    { row: 1, column: 0, rowSpan: 1, columnSpan: 2 }, { row: 2, column: 0, rowSpan: 1, columnSpan: 1 },
    { row: 2, column: 1, rowSpan: 1, columnSpan: 1 },
  ])
})

test('keeps row spans as one anchor', () => {
  const grid = tableGrid(table([child('Cell', { Name: '0:0', RowSpan: '3' }), child('Cell', { Name: '1:0', RowSpan: '3' })]))
  expect(grid.cells.map((cell) => cell.rowSpan)).toEqual([3, 3])
})

describe('malformed grids', () => {
  test('refuses a Name outside the grid', () => {
    expect(() => tableGrid(table([child('Cell', { Name: '2:0' })]))).toThrow('table at Stories/Story.xml#table has cell 2:0 outside the grid')
  })
  test('refuses overlapping spans and names both cells', () => {
    expect(() => tableGrid(table([child('Cell', { Name: '0:0', ColumnSpan: '2' }), child('Cell', { Name: '1:0' })]))).toThrow(
      'table at Stories/Story.xml#table has overlapping cells 0:0 and 1:0',
    )
  })
  test('refuses a missing anchor', () => {
    expect(() => tableGrid(table([child('Cell', { Name: '0:0', RowSpan: '3' }), child('Cell', { Name: '1:0', RowSpan: '2' })]))).toThrow(
      'table at Stories/Story.xml#table has a missing anchor at 1:2',
    )
  })
})

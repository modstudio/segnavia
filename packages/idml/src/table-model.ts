import { refusal } from './refusal.ts'
import type { IdmlTextNode } from './types.ts'

export type TableRegion = 'header' | 'body' | 'footer'

export interface TableGrid {
  direction: 'ltr' | 'rtl'
  columns: number[]
  rows: { region: TableRegion; height?: number; fixed: boolean }[]
  cells: { row: number; column: number; rowSpan: number; columnSpan: number; node: IdmlTextNode }[]
}

function integer(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

function children(node: IdmlTextNode, name: string): IdmlTextNode[] {
  return node.children.filter((child) => child.name === name)
}

function cellLabel(node: IdmlTextNode): string {
  return node.attributes.Name ?? node.location
}

function placeCell(
  table: IdmlTextNode,
  cell: IdmlTextNode,
  occupied: (IdmlTextNode | undefined)[][],
  rowCount: number,
  columnCount: number,
): TableGrid['cells'][number] {
  const match = /^(\d+):(\d+)$/.exec(cell.attributes.Name ?? '')
  const column = match ? Number(match[1]) : -1
  const row = match ? Number(match[2]) : -1
  const rowSpan = Math.max(1, integer(cell.attributes.RowSpan, 1))
  const columnSpan = Math.max(1, integer(cell.attributes.ColumnSpan, 1))
  if (row < 0 || column < 0 || row + rowSpan > rowCount || column + columnSpan > columnCount) {
    throw refusal(`table at ${table.location} has cell ${cellLabel(cell)} outside the grid`, 'give every Cell a Name inside the declared rows and columns')
  }
  for (let y = row; y < row + rowSpan; y += 1) {
    const rowCells = occupied[y]
    if (!rowCells) throw refusal(`table at ${table.location} has cell ${cellLabel(cell)} outside the grid`, 'give every Cell a Name inside the declared rows')
    for (let x = column; x < column + columnSpan; x += 1) {
      const found = rowCells[x]
      if (found) {
        throw refusal(`table at ${table.location} has overlapping cells ${cellLabel(found)} and ${cellLabel(cell)}`, 'remove the overlapping cell spans')
      }
      rowCells[x] = cell
    }
  }
  return { row, column, rowSpan, columnSpan, node: cell }
}

function requireAnchors(table: IdmlTextNode, occupied: (IdmlTextNode | undefined)[][]): void {
  for (const [row, columns] of occupied.entries()) {
    for (const [column, cell] of columns.entries()) {
      if (!cell) throw refusal(`table at ${table.location} has a missing anchor at ${column}:${row}`, 'add a Cell that covers that grid position')
    }
  }
}

export function tableGrid(node: IdmlTextNode): TableGrid {
  const columns = children(node, 'Column').map((column) => Number(column.attributes.SingleColumnWidth ?? column.attributes.Width))
  const rowNodes = children(node, 'Row')
  const header = integer(node.attributes.HeaderRowCount, 0)
  const footer = integer(node.attributes.FooterRowCount, 0)
  const declaredBody = integer(node.attributes.BodyRowCount, rowNodes.length - header - footer)
  const rowCount = header + declaredBody + footer
  const rows = rowNodes.map((row, index) => {
    const height = Number(row.attributes.SingleRowHeight ?? row.attributes.Height)
    return {
      region: index < header ? ('header' as const) : index >= header + declaredBody ? ('footer' as const) : ('body' as const),
      ...(Number.isFinite(height) ? { height } : {}),
      fixed: row.attributes.AutoGrow === 'false',
    }
  })
  const widthCount = columns.length || integer(node.attributes.ColumnCount, 0)
  if (columns.some((width) => !Number.isFinite(width)))
    throw refusal(`table at ${node.location} has a column without a finite width`, 'give every Column a numeric SingleColumnWidth or Width')
  if (widthCount === 0) throw refusal(`table at ${node.location} has no columns`, 'export at least one Column or declare a positive ColumnCount')
  if (rowCount !== rows.length)
    throw refusal(
      `table at ${node.location} declares ${rowCount} rows but contains ${rows.length} Row elements`,
      'make HeaderRowCount, BodyRowCount, and FooterRowCount add up to the number of Row elements',
    )

  const occupied: (IdmlTextNode | undefined)[][] = Array.from({ length: rowCount }, () => Array.from({ length: widthCount }))
  const cells = children(node, 'Cell').map((cell) => placeCell(node, cell, occupied, rowCount, widthCount))
  requireAnchors(node, occupied)
  cells.sort((a, b) => a.row - b.row || a.column - b.column)
  return { direction: node.attributes.TableDirection === 'RightToLeft' ? 'rtl' : 'ltr', columns, rows, cells }
}

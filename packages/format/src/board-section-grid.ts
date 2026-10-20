import type { Board, BoardSection, GridCell } from './board.ts'
import { type BoardShapes, itemHeight } from './board-geometry.ts'
import { SECTION_GAP, SECTION_MIN_SIZE, SECTION_PADDING, SECTION_TITLE_ROOM } from './board-section-constants.ts'
import type { Box, Point } from './deck.ts'

export type GridDropTarget = { anchor: string; side: 'before' | 'after'; axis: 'row' | 'column' } | { row: number; column: number; axis: 'cell' }

function sectionOf(board: Board, id: string): BoardSection | undefined {
  return board.sections.find((section) => section.id === id)
}

function dimensions(board: Board, shapes: BoardShapes, id: string) {
  const item = board.items.find((entry) => entry.id === id)
  const shape = shapes.items[id]
  if (!item || !shape) throw new Error(`item "${id}" has no supplied shape; supply shapes.items["${id}"]`)
  return { width: item.width, height: itemHeight(item, shape) }
}

export function deriveSectionCells(board: Board, shapes: BoardShapes, id: string): GridCell[] {
  const section = sectionOf(board, id)
  if (!section) return []
  const direction = board.direction === 'rtl' ? -1 : 1
  const members = section.items
    .map((member) => {
      const item = board.items.find((entry) => entry.id === member)
      if (!item) return undefined
      return { id: member, x: item.x, y: item.y, bottom: item.y + dimensions(board, shapes, member).height }
    })
    .filter((item): item is NonNullable<typeof item> => item !== undefined)
    .sort((a, b) => a.y - b.y || direction * (a.x - b.x))
  const cells: GridCell[] = []
  let row = -1
  let bottom = Number.NEGATIVE_INFINITY
  let column = 0
  for (const member of members) {
    if (row < 0 || member.y > bottom) {
      row += 1
      column = 0
      bottom = member.bottom
    } else bottom = Math.max(bottom, member.bottom)
    cells.push({ id: member.id, row, column })
    column += 1
  }
  return cells
}

function cellsFor(board: Board, shapes: BoardShapes, section: BoardSection): GridCell[] {
  const members = new Set(section.items)
  return section.cells?.filter((cell) => members.has(cell.id)).map((cell) => ({ ...cell })) ?? deriveSectionCells(board, shapes, section.id)
}

function normalized(cells: readonly GridCell[]): GridCell[] {
  const rows = [...new Set(cells.map((cell) => cell.row))].sort((a, b) => a - b)
  const columns = [...new Set(cells.map((cell) => cell.column))].sort((a, b) => a - b)
  const rowIndex = new Map(rows.map((value, index) => [value, index]))
  const columnIndex = new Map(columns.map((value, index) => [value, index]))
  return cells
    .map((cell) => ({ ...cell, row: rowIndex.get(cell.row) ?? 0, column: columnIndex.get(cell.column) ?? 0 }))
    .sort((a, b) => a.row - b.row || a.column - b.column)
}

function trackSizes(board: Board, shapes: BoardShapes, cells: readonly GridCell[]) {
  const widths = Array.from({ length: Math.max(0, ...cells.map((cell) => cell.column + 1)) }, () => 0)
  const heights = Array.from({ length: Math.max(0, ...cells.map((cell) => cell.row + 1)) }, () => 0)
  for (const cell of cells) {
    const size = dimensions(board, shapes, cell.id)
    widths[cell.column] = Math.max(widths[cell.column] ?? 0, size.width)
    heights[cell.row] = Math.max(heights[cell.row] ?? 0, size.height)
  }
  return { widths, heights }
}

function starts(sizes: readonly number[]): number[] {
  const result: number[] = []
  let value = 0
  for (const size of sizes) {
    result.push(value)
    value += size + SECTION_GAP
  }
  return result
}

function span(sizes: readonly number[]): number {
  return sizes.reduce((sum, size) => sum + size, 0) + SECTION_GAP * Math.max(0, sizes.length - 1)
}

interface SectionGrid {
  cells: GridCell[]
  widths: number[]
  heights: number[]
  columnStarts: number[]
  rowStarts: number[]
  width: number
  height: number
  innerX: number
  innerY: number
}

function sectionGrid(board: Board, shapes: BoardShapes, section: BoardSection): SectionGrid {
  const cells = normalized(cellsFor(board, shapes, section))
  const { widths, heights } = trackSizes(board, shapes, cells)
  return {
    cells,
    widths,
    heights,
    columnStarts: starts(widths),
    rowStarts: starts(heights),
    width: span(widths),
    height: span(heights),
    innerX: section.rectangle.x + SECTION_PADDING,
    innerY: section.rectangle.y + SECTION_PADDING + SECTION_TITLE_ROOM,
  }
}

// Columns are logical: a right-to-left board places column 0 at the grid's right edge.
function physicalX(board: Board, grid: SectionGrid, logicalStart: number, width: number): number {
  return board.direction === 'rtl' ? grid.innerX + grid.width - logicalStart - width : grid.innerX + logicalStart
}

export function layoutSection(board: Board, shapes: BoardShapes, id: string): Board {
  const section = sectionOf(board, id)
  if (!section || section.layout === 'manual') return board
  if (section.items.length === 0)
    return {
      ...board,
      sections: board.sections.map((entry) => (entry.id === id ? { ...entry, cells: [], rectangle: { ...entry.rectangle, ...SECTION_MIN_SIZE } } : entry)),
    }
  const grid = sectionGrid(board, shapes, section)
  const { cells } = grid
  const positions = new Map<string, Point>()
  for (const cell of cells) {
    const width = dimensions(board, shapes, cell.id).width
    positions.set(cell.id, { x: physicalX(board, grid, grid.columnStarts[cell.column] ?? 0, width), y: grid.innerY + (grid.rowStarts[cell.row] ?? 0) })
  }
  return {
    ...board,
    items: board.items.map((item) => {
      const position = positions.get(item.id)
      return position ? { ...item, ...position } : item
    }),
    sections: board.sections.map((entry) =>
      entry.id === id
        ? {
            ...entry,
            cells,
            items: cells.map((cell) => cell.id),
            rectangle: { ...entry.rectangle, width: grid.width + SECTION_PADDING * 2, height: grid.height + SECTION_PADDING * 2 + SECTION_TITLE_ROOM },
          }
        : entry,
    ),
  }
}

function trackAt(value: number, sizes: readonly number[], offsets: readonly number[]): { index: number; gap: boolean } {
  if (value <= 0) return { index: 0, gap: false }
  for (let index = 0; index < sizes.length; index += 1) {
    const end = (offsets[index] ?? 0) + (sizes[index] ?? 0)
    if (value <= end) return { index, gap: false }
    if (index < sizes.length - 1 && value < end + SECTION_GAP) return { index: index + 1, gap: true }
  }
  return { index: Math.max(0, sizes.length - 1), gap: false }
}

export function gridDropTarget(board: Board, shapes: BoardShapes, id: string, point: Point): GridDropTarget | undefined {
  const section = sectionOf(board, id)
  if (!section || section.layout === 'manual') return undefined
  const box = section.rectangle
  if (point.x < box.x || point.x > box.x + box.width || point.y < box.y || point.y > box.y + box.height) return undefined
  const grid = sectionGrid(board, shapes, section)
  const { cells } = grid
  if (cells.length === 0) return { row: 0, column: 0, axis: 'cell' }
  const xOffsets = grid.columnStarts
  const yOffsets = grid.rowStarts
  const fromStart = point.x - grid.innerX
  const x = board.direction === 'rtl' ? grid.width - fromStart : fromStart
  const y = point.y - grid.innerY
  const columnTrack = trackAt(x, grid.widths, xOffsets)
  const rowTrack = trackAt(y, grid.heights, yOffsets)
  if (columnTrack.gap) return targetAtGap(cells, rowTrack.index, columnTrack.index, 'row')
  if (rowTrack.gap) return targetAtGap(cells, rowTrack.index, columnTrack.index, 'column')
  const cell = cells.find((entry) => entry.row === rowTrack.index && entry.column === columnTrack.index)
  if (!cell) return { row: rowTrack.index, column: columnTrack.index, axis: 'cell' }
  const size = dimensions(board, shapes, cell.id)
  const localX = x - (xOffsets[cell.column] ?? 0)
  const localY = y - (yOffsets[cell.row] ?? 0)
  const edges = [
    { distance: Math.abs(localX), target: { anchor: cell.id, side: 'before' as const, axis: 'row' as const } },
    { distance: Math.abs(size.width - localX), target: { anchor: cell.id, side: 'after' as const, axis: 'row' as const } },
    { distance: Math.abs(localY), target: { anchor: cell.id, side: 'before' as const, axis: 'column' as const } },
    { distance: Math.abs(size.height - localY), target: { anchor: cell.id, side: 'after' as const, axis: 'column' as const } },
  ]
  return edges.reduce((best, edge) => (edge.distance < best.distance ? edge : best)).target
}

function targetAtGap(cells: readonly GridCell[], row: number, column: number, axis: 'row' | 'column'): GridDropTarget | undefined {
  const track = cells
    .filter((cell) => (axis === 'row' ? cell.row === row : cell.column === column))
    .sort((a, b) => (axis === 'row' ? a.column - b.column : a.row - b.row))
  const coordinate = axis === 'row' ? column : row
  const after = track.find((cell) => (axis === 'row' ? cell.column : cell.row) >= coordinate)
  if (after) return { anchor: after.id, side: 'before', axis }
  const before = track.at(-1)
  return before ? { anchor: before.id, side: 'after', axis } : undefined
}

export function gridDropMarkerBox(board: Board, shapes: BoardShapes, id: string, target: GridDropTarget): Box | undefined {
  const section = sectionOf(board, id)
  if (!section || section.layout === 'manual') return undefined
  const grid = sectionGrid(board, shapes, section)
  const { innerX, innerY } = grid
  if (grid.cells.length === 0) {
    const width = Math.max(0, section.rectangle.width - SECTION_PADDING * 2)
    const height = Math.max(0, section.rectangle.height - SECTION_PADDING * 2 - SECTION_TITLE_ROOM)
    return { x: innerX, y: innerY, width, height }
  }
  const cell = target.axis === 'cell' ? target : grid.cells.find((entry) => entry.id === target.anchor)
  if (!cell) return undefined
  const columnStart = grid.columnStarts[cell.column] ?? grid.width
  const rowStart = grid.rowStarts[cell.row] ?? grid.height
  const width = grid.widths[cell.column] ?? 0
  const height = grid.heights[cell.row] ?? 0
  const x = physicalX(board, grid, columnStart, width)
  const y = innerY + rowStart
  if (target.axis === 'cell') return { x, y, width, height }
  if (target.axis === 'row') {
    const logicalStart = columnStart + (target.side === 'after' ? width : 0)
    return { x: physicalX(board, grid, logicalStart, 0), y, width: 2, height }
  }
  return { x, y: y + (target.side === 'after' ? height : 0), width, height: 2 }
}

function updateSection(section: BoardSection, cells: readonly GridCell[]): BoardSection {
  const next = normalized(cells)
  return { ...section, cells: next, items: next.map((cell) => cell.id) }
}

export function removeFromGrid(board: Board, shapes: BoardShapes, ids: readonly string[]): Board {
  const removed = new Set(ids)
  return {
    ...board,
    sections: board.sections.map((section) => {
      if (section.layout === 'manual') return { ...section, items: section.items.filter((id) => !removed.has(id)) }
      const cells = cellsFor(board, shapes, section)
      const removedCells = cells.filter((cell) => removed.has(cell.id))
      const kept = cells
        .filter((cell) => !removed.has(cell.id))
        .map((cell) => ({ ...cell, column: cell.column - removedCells.filter((gone) => gone.row === cell.row && gone.column < cell.column).length }))
      return updateSection(section, kept)
    }),
  }
}

export function insertIntoGrid(board: Board, shapes: BoardShapes, id: string, ids: readonly string[], target: GridDropTarget): Board {
  const unique = ids.filter((member, index) => ids.indexOf(member) === index)
  const moved = new Set(unique)
  if (target.axis !== 'cell' && moved.has(target.anchor)) return board
  const removed = removeFromGrid(board, shapes, unique)
  const section = sectionOf(removed, id)
  if (!section || section.layout === 'manual') return removed
  const cells = [...(section.cells ?? [])]
  const anchor = target.axis === 'cell' ? undefined : cells.find((cell) => cell.id === target.anchor)
  if (target.axis !== 'cell' && !anchor) return removed
  const axis = target.axis === 'cell' ? 'row' : target.axis
  const row = target.axis === 'cell' ? target.row : (anchor?.row ?? 0) + (axis === 'column' && target.side === 'after' ? 1 : 0)
  const column = target.axis === 'cell' ? target.column : (anchor?.column ?? 0) + (axis === 'row' && target.side === 'after' ? 1 : 0)
  const inserted = unique.map((member, index) => ({
    id: member,
    row: row + (axis === 'column' ? index : 0),
    column: column + (axis === 'row' ? index : 0),
  }))
  const occupied = inserted.some((placement) => cells.some((cell) => cell.row === placement.row && cell.column === placement.column))
  const shifted = occupied
    ? cells.map((cell) => {
        if (axis === 'row' && cell.row === row && cell.column >= column) return { ...cell, column: cell.column + unique.length }
        if (axis === 'column' && cell.column === column && cell.row >= row) return { ...cell, row: cell.row + unique.length }
        return cell
      })
    : cells
  return { ...removed, sections: removed.sections.map((entry) => (entry.id === id ? updateSection(entry, [...shifted, ...inserted]) : entry)) }
}

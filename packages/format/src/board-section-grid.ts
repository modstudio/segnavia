import type { Board, BoardSection } from './board.ts'
import { type BoardShapes, itemHeight } from './board-geometry.ts'
import { SECTION_GAP, SECTION_MIN_SIZE, SECTION_PADDING, SECTION_TITLE_ROOM } from './board-sections.ts'
import type { Point } from './deck.ts'

export interface GridCell {
  id: string
  row: number
  column: number
}

export interface GridDropTarget {
  row: number
  column: number
  axis: 'row' | 'column'
}

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
  return section.cells?.map((cell) => ({ ...cell })) ?? deriveSectionCells(board, shapes, section.id)
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

export function layoutSection(board: Board, shapes: BoardShapes, id: string): Board {
  const section = sectionOf(board, id)
  if (!section || section.layout === 'manual') return board
  const cells = normalized(cellsFor(board, shapes, section))
  if (section.items.length === 0)
    return {
      ...board,
      sections: board.sections.map((entry) => (entry.id === id ? { ...entry, cells: [], rectangle: { ...entry.rectangle, ...SECTION_MIN_SIZE } } : entry)),
    }
  const { widths, heights } = trackSizes(board, shapes, cells)
  const columnStarts = starts(widths)
  const rowStarts = starts(heights)
  const gridWidth = widths.reduce((sum, width) => sum + width, 0) + SECTION_GAP * Math.max(0, widths.length - 1)
  const gridHeight = heights.reduce((sum, height) => sum + height, 0) + SECTION_GAP * Math.max(0, heights.length - 1)
  const innerX = section.rectangle.x + SECTION_PADDING
  const innerY = section.rectangle.y + SECTION_PADDING + SECTION_TITLE_ROOM
  const positions = new Map<string, Point>()
  for (const cell of cells) {
    const width = dimensions(board, shapes, cell.id).width
    const x = board.direction === 'rtl' ? innerX + gridWidth - (columnStarts[cell.column] ?? 0) - width : innerX + (columnStarts[cell.column] ?? 0)
    positions.set(cell.id, { x, y: innerY + (rowStarts[cell.row] ?? 0) })
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
            rectangle: { ...entry.rectangle, width: gridWidth + SECTION_PADDING * 2, height: gridHeight + SECTION_PADDING * 2 + SECTION_TITLE_ROOM },
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
  const cells = normalized(cellsFor(board, shapes, section))
  if (cells.length === 0) return { row: 0, column: 0, axis: 'row' }
  const tracks = trackSizes(board, shapes, cells)
  const xOffsets = starts(tracks.widths)
  const yOffsets = starts(tracks.heights)
  const gridWidth = tracks.widths.reduce((sum, width) => sum + width, 0) + SECTION_GAP * Math.max(0, tracks.widths.length - 1)
  const physicalX = point.x - box.x - SECTION_PADDING
  const x = board.direction === 'rtl' ? gridWidth - physicalX : physicalX
  const y = point.y - box.y - SECTION_PADDING - SECTION_TITLE_ROOM
  const columnTrack = trackAt(x, tracks.widths, xOffsets)
  const rowTrack = trackAt(y, tracks.heights, yOffsets)
  if (columnTrack.gap) return { row: rowTrack.index, column: columnTrack.index, axis: 'row' }
  if (rowTrack.gap) return { row: rowTrack.index, column: columnTrack.index, axis: 'column' }
  const cell = cells.find((entry) => entry.row === rowTrack.index && entry.column === columnTrack.index)
  if (!cell) return { row: rowTrack.index, column: columnTrack.index, axis: 'row' }
  const size = dimensions(board, shapes, cell.id)
  const localX = x - (xOffsets[cell.column] ?? 0)
  const localY = y - (yOffsets[cell.row] ?? 0)
  const edges = [
    { distance: Math.abs(localX), target: { row: cell.row, column: cell.column, axis: 'row' as const } },
    { distance: Math.abs(size.width - localX), target: { row: cell.row, column: cell.column + 1, axis: 'row' as const } },
    { distance: Math.abs(localY), target: { row: cell.row, column: cell.column, axis: 'column' as const } },
    { distance: Math.abs(size.height - localY), target: { row: cell.row + 1, column: cell.column, axis: 'column' as const } },
  ]
  return edges.reduce((best, edge) => (edge.distance < best.distance ? edge : best)).target
}

function updateSection(section: BoardSection, cells: readonly GridCell[]): BoardSection {
  const next = normalized(cells)
  return { ...section, cells: next, items: next.map((cell) => cell.id) }
}

export function removeFromGrid(board: Board, ids: readonly string[]): Board {
  const removed = new Set(ids)
  return {
    ...board,
    sections: board.sections.map((section) => {
      if (section.layout === 'manual') return { ...section, items: section.items.filter((id) => !removed.has(id)) }
      const cells = section.cells ?? section.items.map((id, column) => ({ id, row: 0, column }))
      const removedCells = cells.filter((cell) => removed.has(cell.id))
      const kept = cells
        .filter((cell) => !removed.has(cell.id))
        .map((cell) => ({ ...cell, column: cell.column - removedCells.filter((gone) => gone.row === cell.row && gone.column < cell.column).length }))
      return updateSection(section, kept)
    }),
  }
}

export function insertIntoGrid(board: Board, id: string, ids: readonly string[], target: GridDropTarget): Board {
  const unique = ids.filter((member, index) => ids.indexOf(member) === index)
  const removed = removeFromGrid(board, unique)
  const section = sectionOf(removed, id)
  if (!section || section.layout === 'manual') return removed
  const cells = [...(section.cells ?? [])]
  const shifted = cells.map((cell) => {
    if (target.axis === 'row' && cell.row === target.row && cell.column >= target.column) return { ...cell, column: cell.column + unique.length }
    if (target.axis === 'column' && cell.column === target.column && cell.row >= target.row) return { ...cell, row: cell.row + unique.length }
    return cell
  })
  const inserted = unique.map((member, index) => ({
    id: member,
    row: target.row + (target.axis === 'column' ? index : 0),
    column: target.column + (target.axis === 'row' ? index : 0),
  }))
  return { ...removed, sections: removed.sections.map((entry) => (entry.id === id ? updateSection(entry, [...shifted, ...inserted]) : entry)) }
}

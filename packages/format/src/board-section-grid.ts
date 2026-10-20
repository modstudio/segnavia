import type { Board, BoardSection } from './board.ts'
import { type BoardShapes, itemHeight } from './board-geometry.ts'
import { SECTION_GAP, SECTION_MIN_SIZE, SECTION_PADDING, SECTION_TITLE_ROOM } from './board-sections.ts'
import type { Point } from './deck.ts'

type Cell = string | null
type Rows = Cell[][]

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

export function deriveSectionRows(board: Board, shapes: BoardShapes, id: string): Rows {
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
  const rows: Rows = []
  let bottom = Number.NEGATIVE_INFINITY
  for (const member of members) {
    if (rows.length === 0 || member.y > bottom) {
      rows.push([member.id])
      bottom = member.bottom
    } else {
      rows.at(-1)?.push(member.id)
      bottom = Math.max(bottom, member.bottom)
    }
  }
  return rows
}

function rowsFor(board: Board, shapes: BoardShapes, section: BoardSection): Rows {
  return section.rows?.map((row) => [...row]) ?? deriveSectionRows(board, shapes, section.id)
}

function trackSizes(board: Board, shapes: BoardShapes, rows: Rows) {
  const columns = Math.max(0, ...rows.map((row) => row.length))
  const widths = Array.from({ length: columns }, () => 0)
  const heights = Array.from({ length: rows.length }, () => 0)
  rows.forEach((row, rowIndex) =>
    row.forEach((id, column) => {
      if (id === null) return
      const size = dimensions(board, shapes, id)
      widths[column] = Math.max(widths[column] ?? 0, size.width)
      heights[rowIndex] = Math.max(heights[rowIndex] ?? 0, size.height)
    }),
  )
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
  const rows = rowsFor(board, shapes, section)
  if (section.items.length === 0) {
    return { ...board, sections: board.sections.map((entry) => (entry.id === id ? { ...entry, rows: [], rectangle: { ...entry.rectangle, ...SECTION_MIN_SIZE } } : entry)) }
  }
  const { widths, heights } = trackSizes(board, shapes, rows)
  const columnStarts = starts(widths)
  const rowStarts = starts(heights)
  const gridWidth = widths.reduce((sum, width) => sum + width, 0) + SECTION_GAP * Math.max(0, widths.length - 1)
  const gridHeight = heights.reduce((sum, height) => sum + height, 0) + SECTION_GAP * Math.max(0, heights.length - 1)
  const innerX = section.rectangle.x + SECTION_PADDING
  const innerY = section.rectangle.y + SECTION_PADDING + SECTION_TITLE_ROOM
  const positions = new Map<string, Point>()
  rows.forEach((row, rowIndex) =>
    row.forEach((member, column) => {
      if (member === null) return
      const width = dimensions(board, shapes, member).width
      const x = board.direction === 'rtl' ? innerX + gridWidth - (columnStarts[column] ?? 0) - width : innerX + (columnStarts[column] ?? 0)
      positions.set(member, { x, y: innerY + (rowStarts[rowIndex] ?? 0) })
    }),
  )
  return {
    ...board,
    items: board.items.map((item) => {
      const position = positions.get(item.id)
      return position ? { ...item, ...position } : item
    }),
    sections: board.sections.map((entry) =>
      entry.id === id
        ? { ...entry, rows, items: rows.flat().filter((member): member is string => member !== null), rectangle: { ...entry.rectangle, width: gridWidth + SECTION_PADDING * 2, height: gridHeight + SECTION_PADDING * 2 + SECTION_TITLE_ROOM } }
        : entry,
    ),
  }
}

function trackAt(value: number, sizes: readonly number[], offsets: readonly number[]): { index: number; gap: boolean } {
  for (let index = 0; index < sizes.length; index += 1) {
    const start = offsets[index] ?? 0
    if (value <= start + (sizes[index] ?? 0)) return { index, gap: false }
    if (index < sizes.length - 1 && value < start + (sizes[index] ?? 0) + SECTION_GAP) return { index: index + 1, gap: true }
  }
  return { index: Math.max(0, sizes.length - 1), gap: false }
}

export function gridDropTarget(board: Board, shapes: BoardShapes, id: string, point: Point): GridDropTarget | undefined {
  const section = sectionOf(board, id)
  if (!section || section.layout === 'manual') return undefined
  const box = section.rectangle
  if (point.x < box.x || point.x > box.x + box.width || point.y < box.y || point.y > box.y + box.height) return undefined
  const rows = rowsFor(board, shapes, section)
  if (rows.length === 0) return { row: 0, column: 0, axis: 'row' }
  const tracks = trackSizes(board, shapes, rows)
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
  const cell = rows[rowTrack.index]?.[columnTrack.index]
  if (cell == null) return { row: rowTrack.index, column: columnTrack.index, axis: 'row' }
  const size = dimensions(board, shapes, cell)
  const localX = x - (xOffsets[columnTrack.index] ?? 0)
  const localY = y - (yOffsets[rowTrack.index] ?? 0)
  const edges = [
    { distance: Math.abs(localX), target: { row: rowTrack.index, column: columnTrack.index, axis: 'row' as const } },
    { distance: Math.abs(size.width - localX), target: { row: rowTrack.index, column: columnTrack.index + 1, axis: 'row' as const } },
    { distance: Math.abs(localY), target: { row: rowTrack.index, column: columnTrack.index, axis: 'column' as const } },
    { distance: Math.abs(size.height - localY), target: { row: rowTrack.index + 1, column: columnTrack.index, axis: 'column' as const } },
  ]
  return edges.reduce((best, edge) => (edge.distance < best.distance ? edge : best)).target
}

function normalize(rows: Rows): Rows {
  let next = rows.map((row) => {
    const copy = [...row]
    while (copy.at(-1) === null) copy.pop()
    return copy
  }).filter((row) => row.some((cell) => cell !== null))
  const columns = Math.max(0, ...next.map((row) => row.length))
  const emptyColumns = Array.from({ length: columns }, (_, column) => column).filter((column) => next.every((row) => row[column] == null))
  next = next.map((row) => row.filter((_, column) => !emptyColumns.includes(column)))
  return next.map((row) => {
    while (row.at(-1) === null) row.pop()
    return row
  })
}

function without(rows: Rows, removed: ReadonlySet<string>): Rows {
  return normalize(rows.map((row) => row.filter((cell) => cell === null || !removed.has(cell))))
}

function withRows(board: Board, sectionId: string, rows: Rows): Board {
  const normalized = normalize(rows)
  const items = normalized.flat().filter((id): id is string => id !== null)
  return { ...board, sections: board.sections.map((section) => (section.id === sectionId ? { ...section, rows: normalized, items } : section)) }
}

export function removeFromGrid(board: Board, ids: readonly string[]): Board {
  const removed = new Set(ids)
  return {
    ...board,
    sections: board.sections.map((section) => {
      if (section.layout === 'manual') return section
      const rows = without(section.rows ?? [section.items], removed)
      return { ...section, rows, items: rows.flat().filter((id): id is string => id !== null) }
    }),
  }
}

export function insertIntoGrid(board: Board, id: string, ids: readonly string[], target: GridDropTarget): Board {
  const unique = ids.filter((member, index) => ids.indexOf(member) === index)
  const removed = removeFromGrid(board, unique)
  const section = sectionOf(removed, id)
  if (!section || section.layout === 'manual') return removed
  const rows = (section.rows ?? []).map((row) => [...row])
  if (target.axis === 'row') {
    while (rows.length <= target.row) rows.push([])
    const row = rows[target.row] as Cell[]
    while (row.length < target.column) row.push(null)
    if (row[target.column] === null) row.splice(target.column, 1, ...unique)
    else row.splice(target.column, 0, ...unique)
  } else {
    const column = rows.map((row) => row[target.column] ?? null)
    column.splice(target.row, 0, ...unique)
    while (rows.length < column.length) rows.push([])
    column.forEach((cell, rowIndex) => {
      const row = rows[rowIndex] as Cell[]
      while (row.length <= target.column) row.push(null)
      row[target.column] = cell
    })
  }
  return withRows(removed, id, rows)
}

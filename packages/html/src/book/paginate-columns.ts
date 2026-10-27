import type { PaginateBlock, PaginateUnit, PaginateWindow } from './paginate-types.ts'

export function paginateColumns(placed: PaginateUnit[]): { windows: PaginateWindow[]; height: number; headerRepeat: number } {
  function columnCount(block: PaginateBlock): number {
    const count = block.columns ?? 1
    return count < 1 ? 1 : count
  }

  function headerFor(): number {
    const first = placed[0]
    if (first?.block.kind !== 'table' || first.index === 0) return 0
    return first.block.headerHeight ?? 0
  }

  function sizes(count: number, columns: number): number[] {
    const base = Math.floor(count / columns)
    const extra = count % columns
    return Array.from({ length: columns }, (_, index) => base + (index < extra ? 1 : 0))
  }

  function lineSpan(unit: PaginateUnit): number {
    return unit.bottom - unit.top
  }

  function sameBlock(left: PaginateBlock, right: PaginateBlock): boolean {
    return left.position.chapter === right.position.chapter && left.position.block === right.position.block
  }

  function emitGroup(group: PaginateUnit[], column: number, columns: number, top: number, windows: PaginateWindow[]): number {
    const first = group[0]
    const last = group[group.length - 1]
    if (!first || !last) return 0
    windows.push({ flow: first.flowId, start: first.top, end: last.bottom, top, column, columns })
    let span = 0
    for (const unit of group) span += lineSpan(unit)
    return span
  }

  function emitColumn(slice: PaginateUnit[], column: number, columns: number, top: number, windows: PaginateWindow[]): number {
    let height = 0
    let index = 0
    while (index < slice.length) {
      const start = index
      const block = slice[index]?.block
      if (!block) break
      index += 1
      while (index < slice.length) {
        const next = slice[index]
        if (!next || !sameBlock(next.block, block)) break
        index += 1
      }
      height += emitGroup(slice.slice(start, index), column, columns, top + height, windows)
    }
    return height
  }

  function emitRun(run: PaginateUnit[], columns: number, top: number, windows: PaginateWindow[]): number {
    const first = run[0]
    const last = run[run.length - 1]
    if (!first || !last) return 0
    if (columns <= 1) {
      windows.push({ flow: first.flowId, start: first.top, end: last.bottom, top, column: 0, columns: 1 })
      return last.bottom - first.top
    }
    const parts = sizes(run.length, columns)
    let offset = 0
    let tallest = 0
    for (let column = 0; column < columns; column += 1) {
      const size = parts[column] ?? 0
      const height = emitColumn(run.slice(offset, offset + size), column, columns, top, windows)
      offset += size
      if (height > tallest) tallest = height
    }
    return tallest
  }

  const headerRepeat = headerFor()
  const windows: PaginateWindow[] = []
  let content = 0
  let index = 0
  while (index < placed.length) {
    const unit = placed[index]
    if (!unit) break
    const columns = columnCount(unit.block)
    let end = index + 1
    while (end < placed.length) {
      const next = placed[end]
      if (!next || columnCount(next.block) !== columns) break
      end += 1
    }
    content += emitRun(placed.slice(index, end), columns, headerRepeat + content, windows)
    index = end
  }
  return { windows, height: headerRepeat + content, headerRepeat }
}

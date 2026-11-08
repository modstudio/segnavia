import type { PaginateBlock, PaginateUnit, PaginateWindow } from './paginate-types.ts'

export function paginateColumns(placed: PaginateUnit[]): { windows: PaginateWindow[]; height: number; headerRepeat: number } {
  function columnCount(block: PaginateBlock): number {
    return block.columns ?? 1
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

  function lineHeight(unit: PaginateUnit): number {
    return unit.bottom - unit.top
  }

  // Clip at the line-box midpoint so pointed Hebrew's marks are not cut.
  function edgeStart(unit: PaginateUnit): number {
    return unit.prevBottom === undefined ? unit.top : (unit.top + unit.prevBottom) / 2
  }

  function edgeEnd(unit: PaginateUnit): number {
    return unit.nextTop === undefined ? unit.bottom : (unit.bottom + unit.nextTop) / 2
  }

  const headerRepeat = headerFor()
  const windows: PaginateWindow[] = []
  let cursorBottom: number | undefined
  let cursorGalley: number | undefined
  let lowest = 0

  function beginY(index: number): number {
    const unit = placed[index]
    if (!unit || cursorBottom === undefined || cursorGalley === undefined) return 0
    return cursorBottom + (unit.top - cursorGalley)
  }

  function stack(from: number, to: number, startY: number): { tallest: number; lastBottom: number } {
    let y = startY
    let tallest = startY
    let lastBottom = startY
    for (let index = from; index < to; index += 1) {
      const unit = placed[index]
      const previous = index > from ? placed[index - 1] : undefined
      if (!unit) break
      if (previous) y += lineHeight(previous) + (unit.top - previous.bottom)
      lastBottom = y + lineHeight(unit)
      if (lastBottom > tallest) tallest = lastBottom
    }
    return { tallest, lastBottom }
  }

  function emit(from: number, to: number, startY: number, column: number, columns: number): void {
    const first = placed[from]
    const last = placed[to - 1]
    if (!first || !last) return
    const start = edgeStart(first)
    windows.push({
      flow: first.flowId,
      start,
      end: edgeEnd(last),
      top: startY - (first.top - start) + headerRepeat,
      column,
      columns,
    })
  }

  function remember(bottom: number, last: PaginateUnit | undefined): void {
    cursorBottom = bottom
    if (last) cursorGalley = last.bottom
  }

  function raise(height: number): void {
    if (height > lowest) lowest = height
  }

  function layoutRun(from: number, to: number, columns: number): void {
    const startY = beginY(from)
    if (columns <= 1) {
      const laid = stack(from, to, startY)
      emit(from, to, startY, 0, 1)
      remember(laid.lastBottom, placed[to - 1])
      raise(laid.tallest)
      return
    }
    const parts = sizes(to - from, columns)
    let offset = 0
    let tallest = startY
    for (let column = 0; column < columns; column += 1) {
      const size = parts[column] ?? 0
      const start = from + offset
      const end = start + size
      offset += size
      if (size === 0) continue
      const laid = stack(start, end, startY)
      emit(start, end, startY, column, columns)
      if (laid.tallest > tallest) tallest = laid.tallest
    }
    remember(tallest, placed[to - 1])
    raise(tallest)
  }

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
    layoutRun(index, end, columns)
    index = end
  }
  return { windows, height: headerRepeat + lowest, headerRepeat }
}
